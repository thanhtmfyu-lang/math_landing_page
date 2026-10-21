#!/usr/bin/env python3
"""Cổng watermark (luật anh Thành 20/10/2026): mọi PDF đề thi, tài liệu của trung tâm (nội bộ hoặc
công khai, gồm đề D01–D20 phòng thi) phải có trên TỪNG trang: watermark "Minh Thành Math",
chân trang "minhthanhmath.vn", "Giáo viên Tô Minh Thành", "82 Chùa Láng", "0967 365 413" (số in to hơn).
Sách biên soạn để bán: chưa áp, không chạy cổng này.
Dùng: python3 kiem_watermark.py <file.pdf | thư mục> ...   -> mã thoát 1 nếu có trang thiếu.
PDF dạng ảnh (không có lớp chữ) bị chặn vì máy không kiểm được."""
import subprocess, sys, unicodedata, shutil
from pathlib import Path

# chân trang tài liệu, đề trung tâm (anh chốt 20/10 15:43); sách bán chưa áp luật này
CAN = ['minh thành math', 'minhthanhmath.vn', 'tô minh thành', '0967 365 413', '82 chùa láng']


def so_trang(p):
    out = subprocess.run(['pdfinfo', str(p)], capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
    for d in out.splitlines():
        if d.startswith('Pages:'):
            return int(d.split()[1])
    return 0


def kiem(p):
    if not shutil.which('pdfinfo') or not shutil.which('pdftotext'):
        import fitz
        with fitz.open(p) as doc:
            thieu = []
            for i, page in enumerate(doc, 1):
                t = unicodedata.normalize('NFC', ' '.join(page.get_text().split())).lower()
                if not all(c in t for c in CAN):
                    thieu.append(i)
            return len(doc), thieu
    n = so_trang(p)
    thieu = []
    for i in range(1, n + 1):
        t = subprocess.run(['pdftotext', '-enc', 'UTF-8', '-f', str(i), '-l', str(i), str(p), '-'],
                           capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
        t = unicodedata.normalize('NFC', ' '.join(t.split())).lower()
        if not all(c in t for c in CAN):
            thieu.append(i)
    return n, thieu


def main(args):
    pdfs = []
    for a in args or ['.']:
        q = Path(a)
        pdfs += sorted(q.rglob('*.pdf')) if q.is_dir() else [q]
    loi = 0
    for p in pdfs:
        n, thieu = kiem(p)
        if n == 0 or thieu:
            loi += 1
            ds = ', '.join(map(str, thieu[:15])) + (' …' if len(thieu) > 15 else '')
            print(f'CHẶN {p}: {len(thieu)}/{n} trang thiếu watermark (trang {ds})')
        else:
            print(f'ĐẠT {p}: {n}/{n} trang có watermark')
    return 1 if loi else 0


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main(sys.argv[1:]))
