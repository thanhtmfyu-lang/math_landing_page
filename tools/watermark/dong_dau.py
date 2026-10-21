#!/usr/bin/env python3
"""Đóng dấu MTM bằng PyMuPDF và Pillow sẵn có, không tự cài thư viện.

Giữ bản gốc bên ngoài thư mục xuất khi ghi đè. Mẫu chốt 20/10:
logo màu mờ giữa trang, chân trang bốn dòng, số liên hệ in đậm.
"""
import io
import os
from pathlib import Path
import shutil
import sys
import unicodedata
import fitz
from PIL import Image
import importlib.util

LOGO = Path(__file__).resolve().parent / 'logo-mtm-mau.png'
_spec = importlib.util.spec_from_file_location('mtm_watermark_gate', Path(__file__).resolve().parents[1] / 'kiem_watermark.py')
_gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_gate)
PHONE = next(s for s in _gate.CAN if any(c.isdigit() for c in s) and 'chùa' not in s)
LINES = ['Minh Thành Math - minhthanhmath.vn', 'Giáo viên Tô Minh Thành', PHONE, 'Địa chỉ lớp học: 18 ngách 23 ngõ 82 Chùa Láng']

def fonts():
    candidates = [(Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
                  (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))]
    for regular, bold in candidates:
        if regular.is_file() and bold.is_file():
            return regular, bold
    raise RuntimeError('Thiếu font Unicode có sẵn; không cài tự động.')

def already_stamped(doc):
    for page in doc:
        text = unicodedata.normalize('NFC', ' '.join(page.get_text().split())).lower()
        text = text.replace('\u00ad','-')
        if not all(x.lower() in text for x in LINES):
            return False
        center=[]
        for image in page.get_image_info(xrefs=True):
            rect=fitz.Rect(image['bbox'])
            if abs((rect.x0+rect.x1)/2-page.rect.width/2)<1 and abs((rect.y0+rect.y1)/2-page.rect.height/2)<1 and abs(rect.width-page.rect.width*.62)<1:
                center.append(image)
        if not center:
            return False
        spans=[s for b in page.get_text('dict')['blocks'] for line in b.get('lines',[]) for s in line.get('spans',[]) if s['bbox'][1]>page.rect.height-75]
        contact=[s for s in spans if ' '.join(s['text'].split())==PHONE]
        if not contact or any('bold' not in s['font'].lower() or s['size']<11 for s in contact):
            return False
    return bool(len(doc))

def dong(vao, ra=None):
    source = Path(vao)
    target = Path(ra) if ra else source
    original = source.read_bytes()
    doc = fitz.open(stream=original, filetype='pdf')
    if already_stamped(doc):
        if target != source:
            target.write_bytes(original)
        print(f'Bỏ qua: đã có mẫu đủ {len(doc)} trang.')
        return
    if target == source:
        backup = Path(os.environ['MTM_WATERMARK_BACKUP_ROOT']) / source.parent.name if os.environ.get('MTM_WATERMARK_BACKUP_ROOT') else source.parent.parent / ('goc-chua-dau-' + source.parent.name)
        backup.mkdir(parents=True, exist_ok=True)
        saved = backup / source.name
        if not saved.exists():
            shutil.copy2(source, saved)
    regular, bold = fonts()
    im = Image.open(LOGO).convert('RGBA')
    im.putdata([(r,g,b,0 if min(r,g,b)>235 else int(a*.10)) for r,g,b,a in im.getdata()])
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    out = fitz.open()
    for i, old in enumerate(doc):
        w, h = old.rect.width, old.rect.height
        for block in old.get_text('dict')['blocks']:
            for line in block.get('lines',[]):
                if line['bbox'][3]<=h-43:continue
                text=''.join(s['text'] for s in line['spans']).strip()
                import re
                if not (text.startswith(('GV.','Minh Thành Math','Trang ')) or re.fullmatch(r'\d+\s*/\s*\d+',text)):
                    raise RuntimeError(f'Có nội dung ngoài chân trang trong dải xử lý, trang {i+1}.')
        old.add_redact_annot(fitz.Rect(0,h-43,w,h), fill=(1,1,1))
        old.apply_redactions(images=0, graphics=0)
        page = out.new_page(width=w, height=h)
        rw = w*.62
        rh = rw*im.height/im.width
        page.show_pdf_page(fitz.Rect(10,6,w-10,h-78), doc, i, keep_proportion=True, overlay=True)
        page.insert_image(fitz.Rect((w-rw)/2,(h-rh)/2,(w+rw)/2,(h+rh)/2), stream=buf.getvalue(), overlay=True)
        page.insert_font(fontname='MTMRegular', fontfile=str(regular))
        page.insert_font(fontname='MTMBold', fontfile=str(bold))
        page.draw_line((36,h-73),(w-36,h-73),color=(.78,.06,.18),width=.7)
        for j, line in enumerate(LINES):
            size = 12 if j==2 else (9 if j==1 else 8)
            y = h-68+j*15
            result = page.insert_textbox(fitz.Rect(22,y,w-22,y+16),line,fontname='MTMBold' if j==2 else 'MTMRegular',fontsize=size,align=1,color=(.13,.2,.41))
            if result < 0:
                raise RuntimeError(f'Chân trang không vừa, trang {i+1}, dòng {j+1}.')
    temporary = target.with_name(target.stem+'.mtm-tmp.pdf')
    out.save(temporary,garbage=4,deflate=True)
    out.close()
    check = fitz.open(temporary)
    if not already_stamped(check):
        raise RuntimeError('Readback chân trang chưa đạt.')
    count = len(check)
    check.close()
    os.replace(temporary,target)
    print(f'Đã đóng dấu và đọc lại: {count} trang.')

if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    dong(sys.argv[1],sys.argv[2] if len(sys.argv)>2 else None)
