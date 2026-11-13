"""Supervise finite BTVN launchers. This file never enables or installs a job."""
from __future__ import annotations

import argparse
import datetime as dt
import errno
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time
import uuid

FIELDS = ('pid', 'role', 'last_seen', 'status', 'last_error_type', 'cycles')
STATUSES = {'starting', 'running', 'waiting', 'stopped', 'error', 'not_running', 'stale', 'busy'}
ERRORS = {'TimeoutExpired', 'ChildProcessError', 'FileNotFoundError', 'PermissionError',
          'OSError', 'KeyboardInterrupt', 'InvalidHeartbeat', 'RuntimeError', 'ValueError'}
# PC: two provider attempts (2*660s), four bridge requests (4*120s),
# plus 120s for local work. This is a ceiling, not an intentional delay.
CHILD_TIMEOUT = {'vps': 900, 'pc': 1920}
HEARTBEAT_SECONDS = 5
STALE_SECONDS = 60


class StopRequested(Exception):
    pass


class LockBusy(Exception):
    pass


def utc_now():
    return dt.datetime.now(dt.timezone.utc)


def safe_error(error):
    name = type(error).__name__
    return name if name in ERRORS else 'RuntimeError'


class ProcessLock:
    """An OS lock, not a PID-file test: crashes automatically release ownership."""
    def __init__(self, path: Path, create=True):
        self.path, self.create, self.handle = path, create, None

    def acquire(self):
        flags = os.O_RDWR | (os.O_CREAT if self.create else 0) | getattr(os, 'O_NOFOLLOW', 0)
        if self.path.is_symlink():
            raise OSError('UNSAFE_LOCK_FILE')
        fd = os.open(self.path, flags, 0o600)
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode):
                raise OSError('INVALID_LOCK_FILE')
            self.handle = os.fdopen(fd, 'r+b', buffering=0)
            fd = None
            if os.fstat(self.handle.fileno()).st_size == 0:
                if not self.create:
                    self.handle.close()
                    self.handle = None
                    return True
                self.handle.write(b'\0')
            self.handle.seek(0)
            try:
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as error:
                self.handle.close()
                self.handle = None
                if error.errno in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                    return False
                raise
            return True
        finally:
            if fd is not None:
                os.close(fd)

    def release(self):
        if self.handle is None:
            return
        try:
            self.handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        finally:
            self.handle.close()
            self.handle = None


def paths(state: Path, role: str):
    return state / (role + '.lock'), state / (role + '.heartbeat.json'), state / (role + '.stop')


def blank_heartbeat(role, status='not_running', error=None):
    return dict(pid=None, role=role, last_seen=None, status=status, last_error_type=error, cycles=0)


def clean_heartbeat(value, role):
    if not isinstance(value, dict) or value.get('role') != role:
        raise ValueError('INVALID_HEARTBEAT')
    pid, cycles, stamp = value.get('pid'), value.get('cycles'), value.get('last_seen')
    if (not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0
            or not isinstance(cycles, int) or isinstance(cycles, bool) or not 0 <= cycles < 2**63
            or value.get('status') not in STATUSES
            or value.get('last_error_type') not in ERRORS | {None}
            or not isinstance(stamp, str)):
        raise ValueError('INVALID_HEARTBEAT')
    parsed = dt.datetime.fromisoformat(stamp)
    if parsed.tzinfo is None:
        raise ValueError('INVALID_HEARTBEAT')
    return {key: value[key] for key in FIELDS}


def write_heartbeat(path: Path, value):
    safe = clean_heartbeat(value, value['role'])
    temporary = path.with_name('.' + path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(safe, stream, ensure_ascii=True, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        # Windows readers may briefly open this file without FILE_SHARE_DELETE.
        # Retry only replacement of our completed temporary heartbeat; never
        # change ACLs, rewrite the destination in place, or retry other I/O.
        for attempt in range(3):
            try:
                os.replace(temporary, path)
                break
            except OSError as error:
                if os.name != 'nt' or getattr(error, 'winerror', None) not in (5, 32, 33) or attempt == 2:
                    raise
                time.sleep((0.05, 0.1)[attempt])
    finally:
        if temporary.exists():
            temporary.unlink()


def status_snapshot(state: Path, role, now=utc_now):
    """Read only: no directory/file creation, native imports, credentials or network."""
    lock_path, heartbeat_path, _ = paths(state, role)
    try:
        with heartbeat_path.open('r', encoding='utf-8') as stream:
            raw = stream.read(4097)
        if len(raw) > 4096:
            raise ValueError('INVALID_HEARTBEAT')
        heartbeat = clean_heartbeat(json.loads(raw), role)
    except FileNotFoundError:
        heartbeat = blank_heartbeat(role)
    except (ValueError, KeyError, TypeError, OSError):
        heartbeat = blank_heartbeat(role, error='InvalidHeartbeat')
    lock = ProcessLock(lock_path, create=False)
    try:
        held = not lock.acquire()
    except FileNotFoundError:
        held = False
    finally:
        lock.release()
    if not held:
        heartbeat['status'] = 'stopped' if heartbeat['status'] == 'stopped' else 'not_running'
    elif heartbeat['last_seen'] is None:
        heartbeat['status'] = 'stale'
    else:
        age = (now() - dt.datetime.fromisoformat(heartbeat['last_seen'])).total_seconds()
        if not 0 <= age <= STALE_SECONDS:
            heartbeat['status'] = 'stale'
    return heartbeat


def stop_child(process):
    """Only terminate our explicitly spawned process group/tree, never other jobs.

    The VPS finite launcher must clean up its separately grouped Node child when
    interrupted. Native locks/guards remain owned by that launcher, not us.
    """
    if process.poll() is not None:
        return
    try:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=15, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        else:
            os.killpg(process.pid, signal.SIGINT)
        process.wait(timeout=15)
    except (ProcessLookupError, OSError, subprocess.TimeoutExpired):
        try:
            if os.name == 'nt':
                process.kill()
            else:
                os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=10)


def run_child(command, timeout, tick, should_stop, *, popen=subprocess.Popen, monotonic=time.monotonic):
    options = dict(stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
    if os.name == 'nt':
        options['creationflags'] = (getattr(subprocess, 'CREATE_NO_WINDOW', 0)
                                    | getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0))
    else:
        options['start_new_session'] = True
    process = popen(command, **options)
    deadline, last_tick = monotonic() + timeout, -float('inf')
    try:
        while True:
            if should_stop():
                raise StopRequested()
            current = monotonic()
            if current >= deadline:
                raise subprocess.TimeoutExpired(command, timeout)
            if current - last_tick >= HEARTBEAT_SECONDS:
                tick()
                last_tick = current
            try:
                code = process.wait(timeout=min(1, deadline - current))
            except subprocess.TimeoutExpired:
                continue
            if code:
                raise ChildProcessError('FINITE_CHILD_FAILED')
            return
    finally:
        if process.poll() is None:
            stop_child(process)


class Supervisor:
    def __init__(self, role, state: Path, launcher_dir: Path, interval=60, *,
                 runner=run_child, now=utc_now, monotonic=time.monotonic, sleep=time.sleep, pid=None):
        if role not in ('vps', 'pc') or not isinstance(interval, (int, float)) or not 30 <= interval < float('inf'):
            raise ValueError('INVALID_SUPERVISOR_OPTIONS')
        self.role, self.state, self.launcher_dir, self.interval = role, state, launcher_dir, interval
        self.runner, self.now, self.monotonic, self.sleep = runner, now, monotonic, sleep
        self.pid, self.cycles, self.error = pid or os.getpid(), 0, None
        self.lock_path, self.heartbeat_path, self.stop_path = paths(state, role)

    def publish(self, status):
        value = dict(pid=self.pid, role=self.role, last_seen=self.now().isoformat(),
                     status=status, last_error_type=self.error, cycles=self.cycles)
        write_heartbeat(self.heartbeat_path, value)
        return value

    def should_stop(self):
        return self.stop_path.exists()

    def commands(self):
        if self.role == 'vps':
            path = self.launcher_dir / 'btvn-web-upload.py'
            return [[sys.executable, str(path), mode, '--auto'] for mode in ('--once', '--review-once')]
        return [[sys.executable, str(self.launcher_dir / 'pc-review-once.py'), '--once']]

    def cycle(self):
        error = None
        for command in self.commands():
            if self.should_stop():
                raise StopRequested()
            try:
                self.publish('running')
                self.runner(command, CHILD_TIMEOUT[self.role], lambda: self.publish('running'), self.should_stop)
            except StopRequested:
                raise
            except (OSError, RuntimeError, subprocess.SubprocessError, ChildProcessError) as exception:
                error = safe_error(exception)
                self.error = error
                self.publish('error')
                # A failed extraction must not starve finite review of older jobs.
        self.cycles += 1
        self.error = error
        self.publish('error' if error else 'waiting')
        return error is None

    def wait(self):
        until = self.monotonic() + self.interval
        while self.monotonic() < until:
            if self.should_stop():
                raise StopRequested()
            self.publish('error' if self.error else 'waiting')
            self.sleep(min(HEARTBEAT_SECONDS, until - self.monotonic()))

    def run(self, watch=False):
        self.state.mkdir(parents=True, exist_ok=True, mode=0o700)
        lock = ProcessLock(self.lock_path)
        if not lock.acquire():
            raise LockBusy()
        code = 0
        try:
            self.publish('starting')
            while not self.should_stop():
                code = 0 if self.cycle() else 1
                if not watch:
                    break
                self.wait()
        except StopRequested:
            code = 0
        except KeyboardInterrupt:
            self.error, code = 'KeyboardInterrupt', 130
        finally:
            try:
                final = self.publish('stopped')
            finally:
                lock.release()
        return final, code


def default_state(role):
    if role == 'vps':
        return Path('/data/state/btvn/web-upload/auto-worker')
    return Path(os.environ.get('MTM_LESSON_PC_STATE',
                'T:/Work/MTM/Website-Native/state/lesson-upload-pc-review')) / 'auto-worker'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--role', choices=('vps', 'pc'), required=True)
    action = parser.add_mutually_exclusive_group(required=True)
    for name in ('once', 'watch', 'status'):
        action.add_argument('--' + name, action='store_true')
    parser.add_argument('--interval', type=float, default=60)
    parser.add_argument('--state-dir', type=Path)
    parser.add_argument('--launcher-dir', type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args(argv)
    if not 30 <= args.interval < float('inf'):
        parser.error('--interval must be finite and at least 30 seconds')
    state = args.state_dir or default_state(args.role)

    def interrupted(_number, _frame):
        raise KeyboardInterrupt()

    previous = signal.signal(signal.SIGTERM, interrupted)
    try:
        try:
            if args.status:
                result, code = status_snapshot(state, args.role), 0
            else:
                result, code = Supervisor(args.role, state, args.launcher_dir, args.interval).run(args.watch)
        except LockBusy:
            try:
                result = status_snapshot(state, args.role)
            except Exception as error:
                result = blank_heartbeat(args.role, error=safe_error(error))
            result['status'], code = 'busy', 75
        except KeyboardInterrupt:
            result, code = blank_heartbeat(args.role, 'stopped', 'KeyboardInterrupt'), 130
        except Exception as error:
            result, code = blank_heartbeat(args.role, 'error', safe_error(error)), 1
    finally:
        signal.signal(signal.SIGTERM, previous)
    print(json.dumps(result, ensure_ascii=True, separators=(',', ':')))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
