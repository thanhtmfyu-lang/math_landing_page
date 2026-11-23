"""Private bounded checkpoints for a single, immutable homework upload."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


VERSION = 'mtm-web-long-pdf-work-v1'
MISMATCH = 'NATIVE_LONG_PDF_PROGRESS_MISMATCH'
UNKNOWN = 'NATIVE_LONG_PDF_PROVIDER_OUTCOME_UNKNOWN'


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def require(condition, code=MISMATCH):
    if not condition:
        raise ValueError(code)


def stamp(plan_hash, records):
    return digest({'plan_hash': plan_hash, 'records': records})


def load_checkpoint(path, plan, tasks, prior, read, validate):
    """Verify the stored prefix and independently compare the last DB acknowledgement."""
    plan_hash = digest(plan)
    if path.exists() or path.is_symlink():
        record = json.loads(read(path, 20 * 1024 * 1024))
        require(isinstance(record, dict) and record.get('schema') == VERSION)
        require(record.get('plan_hash') == plan_hash)
        records = record.get('records')
        require(isinstance(records, list) and len(records) <= len(tasks))
        require(record.get('progress_hash') == stamp(plan_hash, records))
        require(record.get('inflight') in (None, len(records)))
        for task, saved in zip(tasks, records):
            validate(task, saved)
    else:
        records = []
        record = {'schema': VERSION, 'plan_hash': plan_hash, 'records': records,
                  'progress_hash': stamp(plan_hash, records), 'inflight': None}
    if prior is not None:
        require(isinstance(prior, dict) and set(prior) == {
            'sourceVersion', 'plan_hash', 'progress_count', 'progress_hash',
        })
        count = prior['progress_count']
        require(prior['sourceVersion'] == plan['sourceVersion'] and prior['plan_hash'] == plan_hash
                and type(count) is int and 0 < count <= len(records)
                and prior['progress_hash'] == stamp(plan_hash, records[:count]))
    require(record['inflight'] is None, UNKNOWN)
    return record


def advance(path, plan, tasks, prior, *, read, write, validate, run):
    """Do one bounded provider unit. A completed unit survives process restarts."""
    require(0 < len(tasks) <= 128)
    record = load_checkpoint(path, plan, tasks, prior, read, validate)
    records = record['records']
    acknowledged = prior['progress_count'] if prior is not None else 0
    if len(records) < len(tasks) and len(records) == acknowledged:
        task = tasks[len(records)]
        # If the process dies after reserving the call, ordinary retry may
        # inspect the checkpoint but cannot blindly spend on the same unit.
        write(path, {**record, 'inflight': len(records)})
        result = run(task)
        validate(task, result)
        records = records + [result]
        progress_hash = stamp(record['plan_hash'], records)
        record = {**record, 'records': records, 'inflight': None, 'progress_hash': progress_hash}
        write(path, record)
    if len(records) == len(tasks):
        return records, None
    require(len(records) > acknowledged)
    return None, {'status': 'yielded_extract', 'sourceVersion': plan['sourceVersion'],
                  'plan_hash': record['plan_hash'], 'progress_count': len(records),
                  'progress_hash': record['progress_hash']}


def receipt_matches(receipt, valid_receipt, stage, source_version, lesson_key):
    return (isinstance(receipt, dict) and receipt.get('native_stage') == stage
            and receipt.get('source_sha256') == source_version and receipt.get('lesson_key') == lesson_key
            and re.fullmatch('[a-f0-9]{64}', str(receipt.get('request_sha256'))) is not None
            and valid_receipt(receipt))
