"""Offline supervisor tests: fake children/clocks, no network, AI or live worker."""
import contextlib
import datetime as dt
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock
import uuid

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('lesson_auto_worker', ROOT / 'tools/lesson-upload/auto-worker.py')
worker = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = worker
SPEC.loader.exec_module(worker)


class Clock:
    def __init__(self):
        self.seconds = 0
        self.on_sleep = None

    def monotonic(self):
        return self.seconds

    def now(self):
        return dt.datetime(2026, 11, 13, tzinfo=dt.timezone.utc) + dt.timedelta(seconds=self.seconds)

    def sleep(self, seconds):
        self.seconds += seconds
        if self.on_sleep:
            self.on_sleep()


class FakeChild:
    pid = 424242

    def __init__(self, clock, finish_after=2, code=0):
        self.clock, self.finish_after, self.code = clock, finish_after, code
        self.finished = False

    def wait(self, timeout):
        if self.finished:
            return self.code
        remaining = self.finish_after - self.clock.seconds
        if remaining <= timeout:
            self.clock.seconds += max(0, remaining)
            self.finished = True
            return self.code
        self.clock.seconds += timeout
        raise subprocess.TimeoutExpired('fake-child', timeout)

    def poll(self):
        return self.code if self.finished else None


class AutoWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Retain synthetic artifacts on T; no recursive cleanup or live state.
        cls.artifacts = ROOT / '.qa-temp' / 'auto-worker-tests' / uuid.uuid4().hex
        cls.artifacts.mkdir(parents=True)

    def setUp(self):
        self.state = self.artifacts / self._testMethodName
        self.clock, self.calls = Clock(), []

    def runner(self, command, timeout, tick, should_stop):
        self.calls.append((command, timeout))
        tick()

    def supervisor(self, role='vps', runner=None):
        return worker.Supervisor(role, self.state, ROOT / 'tools/lesson-upload', 30,
                                 runner=runner or self.runner, now=self.clock.now,
                                 monotonic=self.clock.monotonic, sleep=self.clock.sleep, pid=1234)

    def read(self, role='vps'):
        return json.loads((self.state / (role + '.heartbeat.json')).read_text(encoding='utf-8'))

    def test_vps_cycle_uses_both_finite_auto_modes(self):
        result, code = self.supervisor().run()
        self.assertEqual(code, 0)
        self.assertEqual([c[0][-2:] for c in self.calls], [['--once', '--auto'], ['--review-once', '--auto']])
        self.assertTrue(all(c[0][0] == sys.executable for c in self.calls))
        self.assertEqual([c[1] for c in self.calls], [900, 900])
        self.assertEqual(result['cycles'], 1)
        self.assertEqual(result['status'], 'stopped')
        self.assertEqual(set(self.read()), set(worker.FIELDS))
        self.assertEqual(set(p.name for p in self.state.iterdir()), {'vps.lock', 'vps.heartbeat.json'})
        self.assertFalse((self.state.parent / 'enabled').exists())

    def test_pc_cycle_keeps_existing_enabled_gate(self):
        result, code = self.supervisor('pc').run()
        self.assertEqual(code, 0)
        command, timeout = self.calls[0]
        self.assertEqual(Path(command[1]).name, 'pc-review-once.py')
        self.assertEqual(command[2:], ['--once'])
        self.assertEqual(timeout, 1920)
        self.assertNotIn('--manual', command)
        self.assertNotIn('--enable', command)
        self.assertEqual(result['role'], 'pc')

    def test_extraction_failure_does_not_starve_review_and_never_prints_secret(self):
        def fail_first(command, timeout, tick, should_stop):
            self.calls.append((command, timeout))
            if len(self.calls) == 1:
                raise ChildProcessError('secret-provider-output-must-not-appear')
        with contextlib.redirect_stdout(io.StringIO()) as stdout:
            result, code = self.supervisor(runner=fail_first).run()
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(code, 1)
        self.assertEqual(result['last_error_type'], 'ChildProcessError')
        self.assertNotIn('secret-provider', json.dumps(result))
        self.assertEqual(stdout.getvalue(), '')

    def test_initial_stop_flag_never_starts_child(self):
        self.state.mkdir()
        (self.state / 'vps.stop').touch()
        result, code = self.supervisor().run(True)
        self.assertEqual((code, result['cycles'], result['status']), (0, 0, 'stopped'))
        self.assertEqual(self.calls, [])

    def test_stop_between_children_prevents_second_child(self):
        def stop_after_first(command, timeout, tick, should_stop):
            self.calls.append((command, timeout))
            (self.state / 'vps.stop').touch()
        result, code = self.supervisor(runner=stop_after_first).run(True)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual((code, result['status']), (0, 'stopped'))

    def test_watch_updates_heartbeat_during_wait_and_stops(self):
        observed = []
        def during_sleep():
            observed.append(self.read()['last_seen'])
            if self.clock.seconds >= 10:
                (self.state / 'vps.stop').touch()
        self.clock.on_sleep = during_sleep
        result, code = self.supervisor().run(True)
        self.assertEqual((code, result['cycles']), (0, 1))
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(len(set(observed)), 2)

    def test_keyboard_interrupt_stops_and_releases_process_lock(self):
        def interrupt(*args):
            raise KeyboardInterrupt()
        result, code = self.supervisor(runner=interrupt).run(True)
        self.assertEqual((code, result['last_error_type']), (130, 'KeyboardInterrupt'))
        lock = worker.ProcessLock(self.state / 'vps.lock')
        self.assertTrue(lock.acquire())
        lock.release()

    def test_real_os_lock_prevents_second_supervisor_without_overwriting_heartbeat(self):
        self.state.mkdir()
        lock = worker.ProcessLock(self.state / 'vps.lock')
        self.assertTrue(lock.acquire())
        try:
            self.supervisor().publish('waiting')
            before = (self.state / 'vps.heartbeat.json').read_bytes()
            with self.assertRaises(worker.LockBusy):
                self.supervisor().run()
            self.assertEqual(self.calls, [])
            self.assertEqual((self.state / 'vps.heartbeat.json').read_bytes(), before)
            self.assertEqual(worker.status_snapshot(self.state, 'vps', self.clock.now)['status'], 'waiting')
        finally:
            lock.release()

    def test_status_missing_is_read_only(self):
        absent = self.state / 'not-created'
        status = worker.status_snapshot(absent, 'pc', self.clock.now)
        self.assertEqual(status['status'], 'not_running')
        self.assertEqual(set(status), set(worker.FIELDS))
        self.assertFalse(absent.exists())

    def test_status_detects_stale_heartbeat_under_live_lock(self):
        self.state.mkdir()
        lock = worker.ProcessLock(self.state / 'vps.lock')
        self.assertTrue(lock.acquire())
        try:
            self.supervisor().publish('running')
            self.clock.seconds += 61
            self.assertEqual(worker.status_snapshot(self.state, 'vps', self.clock.now)['status'], 'stale')
        finally:
            lock.release()

    def test_status_does_not_trust_pid_without_os_lock(self):
        self.state.mkdir()
        self.supervisor().publish('running')
        self.assertEqual(worker.status_snapshot(self.state, 'vps', self.clock.now)['status'], 'not_running')

    def test_atomic_heartbeat_strips_unknown_fields(self):
        self.state.mkdir()
        supervisor = self.supervisor()
        value = supervisor.publish('running')
        value['private_data'] = 'secret-do-not-copy'
        worker.write_heartbeat(supervisor.heartbeat_path, value)
        self.assertEqual(set(self.read()), set(worker.FIELDS))
        self.assertNotIn('secret-do-not-copy', supervisor.heartbeat_path.read_text())
        self.assertFalse(list(self.state.glob('*.tmp')))

    def test_windows_heartbeat_sharing_errors_retry_same_atomic_replacement_twice(self):
        for winerror in (5, 32, 33):
            with self.subTest(winerror=winerror):
                self.state.mkdir(exist_ok=True)
                supervisor = self.supervisor()
                value = supervisor.publish('running')
                before = supervisor.heartbeat_path.read_bytes()
                value['status'] = 'waiting'
                value['private_data'] = 'private-value-never-written'
                error = PermissionError('private-path-never-printed')
                error.winerror = winerror
                replacements, sleeps, committed = [], [], []

                def replace(source, destination):
                    replacements.append((source, destination))
                    self.assertEqual(destination.read_bytes(), before)
                    self.assertEqual(json.loads(source.read_text())['status'], 'waiting')
                    if len(replacements) <= 2:
                        raise error
                    # This test models two sharing failures and a successful
                    # commit. A real third replace after mocked/no-op sleeps
                    # can hit an unrelated Windows reader and exhaust the
                    # already-used retry budget. Capture the exact completed
                    # bytes instead; real atomic replacement has its own test
                    # and the controlled read-handle reproduction receipt.
                    committed.append(source.read_bytes())

                def sleep(delay):
                    sleeps.append(delay)
                    # No partially rewritten destination is visible while held.
                    self.assertEqual(supervisor.heartbeat_path.read_bytes(), before)

                with mock.patch.object(worker.os, 'name', 'nt'), \
                        mock.patch.object(worker.os, 'replace', side_effect=replace), \
                        mock.patch.object(worker.time, 'sleep', side_effect=sleep), \
                        contextlib.redirect_stdout(io.StringIO()) as stdout, \
                        contextlib.redirect_stderr(io.StringIO()) as stderr:
                    worker.write_heartbeat(supervisor.heartbeat_path, value)
                self.assertEqual(sleeps, [0.05, 0.1])
                self.assertEqual(len(replacements), 3)
                self.assertEqual(len(set(replacements)), 1)
                self.assertEqual(len(committed), 1)
                self.assertEqual(json.loads(committed[0]), {k: value[k] for k in worker.FIELDS})
                self.assertEqual(json.loads(committed[0])['status'], 'waiting')
                self.assertEqual(set(json.loads(committed[0])), set(worker.FIELDS))
                self.assertNotIn(b'private-', committed[0])
                # The replace stub deliberately does not mutate the real file.
                self.assertEqual(supervisor.heartbeat_path.read_bytes(), before)
                self.assertFalse(list(self.state.glob('*.tmp')))
                self.assertEqual((stdout.getvalue(), stderr.getvalue()), ('', ''))

    def test_windows_permanent_heartbeat_lock_raises_after_two_retries(self):
        self.state.mkdir()
        supervisor = self.supervisor()
        value = supervisor.publish('running')
        before = supervisor.heartbeat_path.read_bytes()
        value['status'] = 'waiting'
        error = PermissionError('private-path-never-printed')
        error.winerror = 32
        with mock.patch.object(worker.os, 'name', 'nt'), \
                mock.patch.object(worker.os, 'replace', side_effect=error) as replace, \
                mock.patch.object(worker.time, 'sleep') as sleep, \
                contextlib.redirect_stdout(io.StringIO()) as stdout, \
                contextlib.redirect_stderr(io.StringIO()) as stderr:
            with self.assertRaises(PermissionError) as raised:
                worker.write_heartbeat(supervisor.heartbeat_path, value)
        self.assertIs(raised.exception, error)
        self.assertEqual(replace.call_count, 3)
        self.assertEqual(sleep.call_args_list, [mock.call(0.05), mock.call(0.1)])
        self.assertEqual(len(set(call.args for call in replace.call_args_list)), 1)
        self.assertEqual(supervisor.heartbeat_path.read_bytes(), before)
        self.assertFalse(list(self.state.glob('*.tmp')))
        self.assertEqual((stdout.getvalue(), stderr.getvalue()), ('', ''))

    def test_heartbeat_non_windows_or_other_error_never_retries(self):
        self.state.mkdir()
        supervisor = self.supervisor()
        value = supervisor.publish('running')
        before = supervisor.heartbeat_path.read_bytes()
        for platform, winerror in [('posix', 32), ('nt', 2), ('nt', None)]:
            with self.subTest(platform=platform, winerror=winerror):
                error = PermissionError('private-path-never-printed')
                if winerror is not None:
                    error.winerror = winerror
                with mock.patch.object(worker.os, 'name', platform), \
                        mock.patch.object(worker.os, 'replace', side_effect=error) as replace, \
                        mock.patch.object(worker.time, 'sleep') as sleep:
                    with self.assertRaises(PermissionError) as raised:
                        worker.write_heartbeat(supervisor.heartbeat_path, value)
                self.assertIs(raised.exception, error)
                replace.assert_called_once()
                sleep.assert_not_called()
                self.assertEqual(supervisor.heartbeat_path.read_bytes(), before)
                self.assertFalse(list(self.state.glob('*.tmp')))

    def test_malformed_status_never_echoes_untrusted_payload(self):
        self.state.mkdir()
        path = self.state / 'vps.heartbeat.json'
        for raw in ['not-json-secret', json.dumps({'role':'vps','status':'credential-secret'}), 'x' * 5000]:
            path.write_text(raw, encoding='utf-8')
            result = worker.status_snapshot(self.state, 'vps', self.clock.now)
            self.assertEqual(result['last_error_type'], 'InvalidHeartbeat')
            self.assertNotIn('secret', json.dumps(result))

    def test_invalid_interval_rejected_before_start(self):
        for interval in [0, 29, float('nan'), float('inf')]:
            with self.assertRaises(ValueError):
                worker.Supervisor('vps', self.state, ROOT, interval)
        self.assertFalse(self.state.exists())

    def test_cli_status_only_emits_allowlisted_snapshot(self):
        with contextlib.redirect_stdout(io.StringIO()) as stdout:
            code = worker.main(['--role','pc','--status','--state-dir',str(self.state)])
        self.assertEqual(code, 0)
        self.assertEqual(set(json.loads(stdout.getvalue())), set(worker.FIELDS))
        self.assertFalse(self.state.exists())

    def test_child_output_is_suppressed_and_group_is_separate(self):
        clock, options = Clock(), {}
        child = FakeChild(clock)
        def popen(command, **kwargs):
            options.update(kwargs)
            return child
        ticks = []
        worker.run_child(['fake.py','--once'], 20, lambda:ticks.append(clock.seconds), lambda:False,
                         popen=popen, monotonic=clock.monotonic)
        self.assertEqual(options['stdout'], subprocess.DEVNULL)
        self.assertEqual(options['stderr'], subprocess.DEVNULL)
        self.assertNotIn('shell', options)
        self.assertTrue(options['close_fds'])
        if os.name == 'nt':
            self.assertTrue(options['creationflags'] & subprocess.CREATE_NO_WINDOW)
            self.assertTrue(options['creationflags'] & subprocess.CREATE_NEW_PROCESS_GROUP)
        else:
            self.assertTrue(options['start_new_session'])
        self.assertTrue(ticks)

    def test_child_timeout_cleans_only_its_own_child(self):
        clock = Clock()
        child = FakeChild(clock, finish_after=100)
        ticks, stopped = [], []
        def stop(process):
            stopped.append(process)
            process.finished = True
        with mock.patch.object(worker, 'stop_child', side_effect=stop):
            with self.assertRaises(subprocess.TimeoutExpired):
                worker.run_child(['fake.py'], 11, lambda:ticks.append(clock.seconds), lambda:False,
                                 popen=lambda *a,**k:child, monotonic=clock.monotonic)
        self.assertEqual(stopped, [child])
        self.assertEqual(clock.seconds, 11)
        self.assertEqual(ticks, [0,5,10])

    def test_child_stop_flag_interrupts_finite_child(self):
        clock = Clock()
        child = FakeChild(clock, finish_after=100)
        with mock.patch.object(worker, 'stop_child') as stop:
            with self.assertRaises(worker.StopRequested):
                worker.run_child(['fake.py'], 100, lambda:None, lambda:clock.seconds >= 3,
                                 popen=lambda *a,**k:child, monotonic=clock.monotonic)
        stop.assert_called_once_with(child)
        self.assertEqual(clock.seconds, 3)

    def test_nonzero_child_exit_is_sanitized_without_extra_kill(self):
        clock = Clock()
        child = FakeChild(clock, finish_after=0, code=3)
        with mock.patch.object(worker, 'stop_child') as stop:
            with self.assertRaises(ChildProcessError):
                worker.run_child(['fake.py'], 20, lambda:None, lambda:False,
                                 popen=lambda *a,**k:child, monotonic=clock.monotonic)
        stop.assert_not_called()

    def test_heartbeat_failure_also_cleans_active_child(self):
        child, clock = FakeChild(Clock(), finish_after=100), Clock()
        with mock.patch.object(worker, 'stop_child') as stop:
            with self.assertRaises(PermissionError):
                worker.run_child(['fake.py'], 20, mock.Mock(side_effect=PermissionError('secret-path')),
                                 lambda:False, popen=lambda *a,**k:child, monotonic=clock.monotonic)
        stop.assert_called_once_with(child)

    def test_posix_cleanup_interrupts_then_kills_only_spawned_group(self):
        child = mock.Mock(pid=424242)
        child.poll.return_value = None
        child.wait.side_effect = [subprocess.TimeoutExpired('fake.py', 15), 0]
        with mock.patch.object(worker.os, 'name', 'posix'), \
                mock.patch.object(worker.signal, 'SIGKILL', 9, create=True), \
                mock.patch.object(worker.os, 'killpg', create=True) as kill:
            worker.stop_child(child)
        self.assertEqual(kill.call_args_list,
                         [mock.call(424242, worker.signal.SIGINT), mock.call(424242, 9)])

    def test_windows_cleanup_uses_owned_pid_tree_and_discards_output(self):
        child = mock.Mock(pid=424242)
        child.poll.return_value = None
        with mock.patch.object(worker.os, 'name', 'nt'), mock.patch.object(worker.subprocess, 'run') as run:
            worker.stop_child(child)
        self.assertEqual(run.call_args.args[0], ['taskkill','/PID','424242','/T','/F'])
        self.assertEqual(run.call_args.kwargs['stdout'], subprocess.DEVNULL)
        self.assertEqual(run.call_args.kwargs['stderr'], subprocess.DEVNULL)
        child.kill.assert_not_called()

    def test_cli_busy_status_failure_is_sanitized_and_restores_signal_handler(self):
        previous = worker.signal.getsignal(worker.signal.SIGTERM)
        with mock.patch.object(worker.Supervisor, 'run', side_effect=worker.LockBusy()), \
                mock.patch.object(worker, 'status_snapshot', side_effect=PermissionError('secret-path')), \
                contextlib.redirect_stdout(io.StringIO()) as stdout:
            code = worker.main(['--role','pc','--once','--state-dir',str(self.state)])
        self.assertEqual(code, 75)
        self.assertEqual(json.loads(stdout.getvalue())['last_error_type'], 'PermissionError')
        self.assertNotIn('secret', stdout.getvalue())
        self.assertEqual(worker.signal.getsignal(worker.signal.SIGTERM), previous)

    def test_cli_interrupt_outside_cycle_is_sanitized(self):
        previous = worker.signal.getsignal(worker.signal.SIGTERM)
        with mock.patch.object(worker.Supervisor, 'run', side_effect=KeyboardInterrupt()), \
                contextlib.redirect_stdout(io.StringIO()) as stdout:
            code = worker.main(['--role','pc','--once','--state-dir',str(self.state)])
        self.assertEqual(code, 130)
        self.assertEqual(json.loads(stdout.getvalue())['status'], 'stopped')
        self.assertEqual(worker.signal.getsignal(worker.signal.SIGTERM), previous)


if __name__ == '__main__':
    unittest.main()
