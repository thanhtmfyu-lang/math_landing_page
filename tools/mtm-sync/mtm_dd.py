"""Gọi kho điểm danh chung MTM (Supabase Edge mtm-diem-danh). Mã đọc từ mtm-dd.env cạnh publish.env (state_root), KHÔNG in ra.
Dùng: python3 -I '/brains/Brain Default/Javis/scripts/mtm_dd.py' '<json body>'   hoặc   ... @file.json
Ví dụ: '{"action":"session","class":"2K9 8+","date":"2026-10-17"}'
Hành động: move, cancel_move, raw (vân tay), mark, alias, unmatched, session, find, moves (xem hợp đồng ở memory/internal/kho-diem-danh.md)."""
import json, sys, os, urllib.request, urllib.error
ENV = "/brains/Brain Default/Javis/btvn/.mtm-dd.env"  # bản cũ trong brain, chỉ còn là đường dự phòng
def _env_path():
    # Thứ tự: biến MTM_DD_ENV, rồi mtm-dd.env cạnh publish.env (state_root của runtime), rồi bản cũ trong brain
    if os.environ.get("MTM_DD_ENV"):
        return os.environ["MTM_DD_ENV"]
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))  # nối cuối để không che thư viện chuẩn
    from runtime import state_root
    p = state_root() / "mtm-dd.env"
    return str(p) if p.is_file() else ENV
def _cfg():
    path = _env_path()
    v = {}
    for line in open(path, encoding="utf-8").read().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, x = line.split("=", 1); v[k.strip()] = x.strip()
    return v["MTM_DD_URL"], v["MTM_DD_TOKEN"]
def goi(body, timeout=60):
    url, tok = _cfg()
    req = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "x-mtm-token": tok}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode("utf-8") or "{}")
        except Exception: return e.code, {"error": "HTTP %s" % e.code}
# SYNC-20261019: lệnh ghi chuẩn có nguồn, replay và readback tách từng đích.
import hashlib
from pathlib import Path
LOADED_SOURCE_SHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

def thanh_cong(http, data):
    if http >= 400:
        return False
    if isinstance(data, dict):
        if data.get("error") or data.get("ok") is False or data.get("syncStatus") in ("partial", "failed", "rejected"):
            return False
        result = data.get("result")
        if isinstance(result, dict) and (result.get("error") or result.get("ok") is False):
            return False
    return True

def thuc_hien(command, source_msg, timeout=60):
    """source_msg là locator nguồn ổn định và số thứ tự hành động, không chứa tên/SĐT.
    Kho đã ghi thành công vẫn có thể còn đích blocked/pending. Không gửi lại lệnh
    nghiệp vụ để chữa lỗi một đích. Dùng dong_bo_trang_thai để đọc từng đích.
    """
    if not isinstance(command, dict) or not command.get("action"):
        raise ValueError("Thiếu hành động kho")
    if not isinstance(source_msg, str) or not source_msg.strip():
        raise ValueError("Thiếu mã nguồn ổn định")
    return goi({"action":"sync_execute", "sourceMsg":source_msg, "command":command}, timeout)

def dong_bo_trang_thai(source_msg=None, timeout=60):
    body={"action":"sync_status"}
    if source_msg:
        body["sourceMsg"]=source_msg
    return goi(body, timeout)

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    a = sys.argv[1]
    body = json.load(open(a[1:], encoding="utf-8")) if a.startswith("@") else json.loads(a)
    st, data = goi(body)
    print(json.dumps({"http": st, "data": data}, ensure_ascii=False))
    sys.exit(0 if thanh_cong(st, data) else 1)
