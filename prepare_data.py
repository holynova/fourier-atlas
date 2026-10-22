"""Generate local Fourier data from Natural Earth Admin 0 (110m) and Admin 1 (50m).
Projection: locally centered equirectangular, standard parallel at lat0.
2048 equal-arclength samples per external ring; DC plus 1024 largest nonzero terms.
Taiwan's source geometry is appended to the China selection, using the same projection.
"""
import json, math
from pathlib import Path
import numpy as np
base=Path(__file__).parent
features=json.loads((base/'countries-source.geojson').read_text())['features']
provinces=json.loads((base/'provinces-source.geojson').read_text())['features']
choices=[('CHN','中国','China',105,35),('USA','美国','United States',-100,39),('CAN','加拿大','Canada',-105,60),('BRA','巴西','Brazil',-52,-10),('GBR','英国','United Kingdom',-3,55),('FRA','法国','France',2,47),('RUS','俄罗斯','Russia',100,60),('IND','印度','India',79,22),('JPN','日本','Japan',138,37),('AUS','澳大利亚','Australia',134,-25)]
# 2024 year-end permanent population (10,000 persons), Jiangsu Statistics Yearbook 2025.
# https://tj.jiangsu.gov.cn/2025/nj21/nj2101.htm
province_choices=[('CN-GD','广东',12780),('CN-SD','山东',10080),('CN-HA','河南',9785),('CN-JS','江苏',8526),('CN-SC','四川',8364),('CN-HE','河北',7378),('CN-ZJ','浙江',6670),('CN-HN','湖南',6539),('CN-AH','安徽',6123),('CN-HB','湖北',5834)]
def polygons(f):
 g=f['geometry']
 return g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
def make_map(code,name,en,lon0,lat0,source_polys,group,note,full_name=None,planar=False):
 rings=[]
 for poly,label in source_polys:
  ring=poly[0]
  if code=='FRA' and sum(p[1] for p in ring)/len(ring)<30:continue
  xy=np.array(ring) if planar else np.array([[(((p[0]-lon0+180)%360)-180)*math.cos(math.radians(lat0)),-(p[1]-lat0)] for p in ring])
  if np.linalg.norm(xy[0]-xy[-1])<1e-8:xy=xy[:-1]
  xy=xy[np.r_[True,np.linalg.norm(np.diff(xy,axis=0),axis=1)>1e-9]]
  xy=np.vstack([xy,xy[0]])
  cum=np.r_[0,np.cumsum(np.linalg.norm(np.diff(xy,axis=0),axis=1))]
  d=np.arange(2048)/2048*cum[-1]
  z=np.interp(d,cum,xy[:,0])+1j*np.interp(d,cum,xy[:,1])
  c=np.fft.fft(z)/2048
  order=sorted(range(1,2048),key=lambda k:abs(c[k]),reverse=True)[:1024]
  item={'points':np.round(xy,5).tolist(),'center':[round(c[0].real,6),round(c[0].imag,6)],'length':round(cum[-1],5),'terms':[[k if k<=1024 else k-2048,round(abs(c[k]),7),round(float(np.angle(c[k])),7)] for k in order], 'energy':round(float(np.sum(np.abs(c[1:])**2)),8)}
  if planar:item['points']=np.round(np.column_stack([np.r_[z.real,z.real[0]],np.r_[z.imag,z.imag[0]]]),5).tolist()
  if label:item['label']=label
  rings.append(item)
 rings.sort(key=lambda r:r['length'],reverse=True)
 return {'id':code,'name':name,'en':en,'rings':rings,'group':group,'note':note,'fullName':full_name or name}
out=[]
for code,name,en,lon0,lat0 in choices:
 f=next(f for f in features if f['properties']['ADM0_A3']==code)
 source_polys=[(p,None) for p in polygons(f)]
 note='欧洲本土与科西嘉岛' if code=='FRA' else '各陆地轮廓独立绘制'
 if code=='CHN':
  taiwan=next(f for f in features if f['properties']['ADM0_A3']=='TWN')
  source_polys.extend((p,None) for p in polygons(taiwan))
  note='含台湾、海南 · 岛屿独立绘制'
 out.append(make_map(code,name,en,lon0,lat0,source_polys,'world',note))
for rank,(code,name,population) in enumerate(province_choices,1):
 f=next(f for f in provinces if f['properties']['iso_3166_2']==code)
 props=f['properties']
 item=make_map(code,name,props['name_en'],props['longitude'],props['latitude'],[(p,None) for p in polygons(f)],'province',f'2024 人口第 {rank} · {population:,} 万人',props['name_zh'])
 item.update(population=population,populationYear=2024,rank=rank)
 out.append(item)
# Mathematically generated closed curves, resampled by arclength in the same pipeline.
def polar(t,r):return np.column_stack([r*np.cos(t),r*np.sin(t)])
t=np.linspace(0,2*np.pi,4097)
curves=[]
curves.append(('ROSE','十二瓣玫瑰','Twelve-petal rose',polar(t,np.cos(6*t)),'极坐标玫瑰线 · 12 瓣'))
bt=np.linspace(0,24*np.pi,12001)
br=np.exp(np.cos(bt))-2*np.cos(4*bt)-np.sin(bt/12)**5
curves.append(('BUTTERFLY','蝴蝶曲线','Butterfly curve',np.column_stack([np.sin(bt)*br,-np.cos(bt)*br]),'闭合参数曲线 · 多重蝶翼'))
st=np.linspace(0,14*np.pi,8193)
curves.append(('SPIRO','齿轮花环','Hypotrochoid',np.column_stack([4*np.cos(st)+6*np.cos(4*st/7),4*np.sin(st)-6*np.sin(4*st/7)]),'内旋轮线 · 11 重花环'))
curves.append(('LISSAJOUS','李萨如线','Lissajous curve',np.column_stack([np.sin(5*t+np.pi/2),np.sin(4*t)]),'横纵频率 5 : 4 · 交织曲线'))
vertices=np.exp(1j*(np.arange(3)*2*np.pi/3-np.pi/2))
for _ in range(3):
 expanded=[]
 for i,a in enumerate(vertices):
  b=vertices[(i+1)%len(vertices)];d=(b-a)/3
  expanded.extend([a,a+d,a+d+d*np.exp(-1j*np.pi/3),a+2*d])
 vertices=np.array(expanded)
curves.append(('KOCH','科赫雪花','Koch snowflake',np.column_stack([vertices.real,vertices.imag]),'三阶分形雪花 · 尖角与细节'))
rr=(np.abs(np.cos(7*t/4))**.4+np.abs(np.sin(7*t/4))**.4)**(-1/.3)
curves.append(('MANDALA','曼陀罗','Superformula mandala',polar(t,rr),'超公式 · 七重花瓣'))
curves.append(('TREFOIL','三叶结','Trefoil projection',polar(2*t,2+np.cos(3*t)),'三叶结的平面投影 · 自相交曲线'))
curves.append(('STAR','星芒曲线','Harmonic starburst',polar(t,1+.2*np.cos(13*t)+.09*np.cos(29*t)),'13 与 29 次谐波 · 密集星芒'))
for code,name,en,points,note in curves:
 out.append(make_map(code,name,en,0,0,[([points.tolist()],None)],'complex',note,planar=True))
(base/'dist/countries.js').write_text('window.ATLAS_COUNTRIES='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n')
print('Maps:',len(out),'Contours:',sum(len(c['rings']) for c in out),'Bytes:',(base/'dist/countries.js').stat().st_size)
