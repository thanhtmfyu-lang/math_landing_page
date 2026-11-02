"""Bounded AST arithmetic; no eval/sympify/parse_expr on provider strings.
Checks supplied mathematical claims; unsupported/uncertain claims fail closed.
The two independent solutions and existing production key validator remain mandatory.
"""
import ast,hashlib,json,re
def encoded(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def need(v,code):
 if not v:raise ValueError(code)
def expression(text,sp):
 need(isinstance(text,str) and 0<len(text)<=512,'INVALID_CAS_EXPRESSION')
 tree=ast.parse(text,mode='eval');need(sum(1 for _ in ast.walk(tree))<=100,'CAS_EXPRESSION_LIMIT')
 symbols={n:sp.Symbol(n,real=True) for n in ['x','y','z','t','a','b','c','n']};symbols|={'pi':sp.pi,'E':sp.E}
 funcs={'sqrt':sp.sqrt,'sin':sp.sin,'cos':sp.cos,'tan':sp.tan,'exp':sp.exp,'log':sp.log,'Rational':sp.Rational,'diff':sp.diff,'Abs':sp.Abs}
 def visit(n):
  if isinstance(n,ast.Constant) and type(n.value) in (int,float):
   need(abs(n.value)<10**12,'CAS_NUMBER_LIMIT');return sp.Rational(str(n.value))
  if isinstance(n,ast.Name):need(n.id in symbols,'CAS_NAME_FORBIDDEN');return symbols[n.id]
  if isinstance(n,ast.UnaryOp) and isinstance(n.op,(ast.UAdd,ast.USub)):return visit(n.operand)*(1 if isinstance(n.op,ast.UAdd) else -1)
  if isinstance(n,ast.BinOp):
   left,right=visit(n.left),visit(n.right)
   if isinstance(n.op,ast.Add):return left+right
   if isinstance(n.op,ast.Sub):return left-right
   if isinstance(n.op,ast.Mult):return left*right
   if isinstance(n.op,ast.Div):need(right!=0,'CAS_DIV_ZERO');return left/right
   if isinstance(n.op,ast.Pow):
    need(right.is_number and abs(right)<=20,'CAS_POWER_LIMIT')
    if left.is_Rational and right.is_Integer:need(max(abs(int(left.p)).bit_length(),int(left.q).bit_length())*abs(int(right))<=4096,'CAS_RESULT_LIMIT')
    return left**right
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in funcs and not n.keywords and 1<=len(n.args)<=3:return funcs[n.func.id](*[visit(x) for x in n.args])
  raise ValueError('CAS_AST_FORBIDDEN')
 value=visit(tree.body);need(not value.has(sp.zoo,sp.nan,sp.oo,-sp.oo) and sp.count_ops(value)<=80,'CAS_UNDEFINED');return value
def numeric(text,sp):
 # Only directly parsable mathematical source statements. Never trust unrelated
 # lhs/rhs supplied by a reviewer as a certificate for the selected answer.
 text=text.strip().replace('×','*').replace('÷','/').replace(':','/').replace('−','-').replace('^','**')
 value=expression(text,sp);need(not value.free_symbols,'CAS_SYMBOLIC_SOURCE_UNSUPPORTED');return value
def source_answer(q,slot,actual,sp):
 if q['kind']=='tf':
  statement=q['statements']['abcd'.index(slot)];parts=re.split(r'\s*(=|!=|≠)\s*',statement)
  need(len(parts)==3,'CAS_STATEMENT_UNSUPPORTED');delta=sp.simplify(numeric(parts[0],sp)-numeric(parts[2],sp));need(delta.is_zero in (True,False),'CAS_UNDECIDABLE')
  answer=bool(delta.is_zero) if parts[1]=='=' else not bool(delta.is_zero);need(type(actual) is bool and actual==answer,'CAS_KEY_MISMATCH');return
 need(q['kind'] in ('mc','short'),'CAS_SELF_PROOF_UNSUPPORTED')
 prompt=q.get('prompt') or q.get('text') or '';prompt=re.sub(r'\s*=\s*\?\s*$','',prompt)
 result=numeric(prompt,sp)
 if q['kind']=='mc':
  need(actual in ['A','B','C','D'] and isinstance(q.get('choices'),list) and len(q['choices'])==4,'CAS_CHOICE_REQUIRED');selected=numeric(q['choices'][ord(actual)-65],sp)
 else:
  need(isinstance(actual,str),'CAS_SHORT_REQUIRED');selected=numeric(actual.replace(',','.'),sp)
 need(sp.simplify(result-selected)==0,'CAS_KEY_MISMATCH')
def verify(value):
 try:
  import resource
  resource.setrlimit(resource.RLIMIT_AS,(512*1024*1024,512*1024*1024));resource.setrlimit(resource.RLIMIT_CPU,(10,10))
 except ImportError:pass
 import sympy as sp
 source=value['sourceVersion'];reviews=value['reviews'];need(len(reviews)==2 and {r['provider'] for r in reviews}=={'grok','agy'},'CAS_TWO_REVIEWS_REQUIRED')
 questions=value['questions'];expected={(q['id'],slot) for q in questions for slot in (['a','b','c','d'] if q['kind']=='tf' else ['answer'])};audit=[]
 for review in reviews:
  need(review['sourceVersion']==source,'CAS_SOURCE_MISMATCH');slots=review['slots'];need(len(slots)==len(expected) and {(s['question_id'],s['slot']) for s in slots}==expected,'CAS_COVERAGE')
  for slot in slots:
   q=next(q for q in questions if q['id']==slot['question_id']);source_answer(q,slot['slot'],slot['actual'],sp);audit.append({'question_id':q['id'],'slot':slot['slot'],'actual':slot['actual']})
 slots=reviews[0]['slots'];receipt={'engine':'sympy','version':sp.__version__,'sourceVersion':source,'passed':True,'slots':slots,'claims':audit,'reviews':[r['receipt_hash'] for r in reviews]}
 return {k:v for k,v in receipt.items() if k not in ('claims','reviews')}|{'receipt_hash':hashlib.sha256(encoded(receipt)).hexdigest()}
