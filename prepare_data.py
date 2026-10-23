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
# Museum motif tracings. Closed contours are kept separate so no false connecting lines appear.
artwork=json.loads((base/'artwork-contours.json').read_text())
for motif in artwork['items']:
 item=make_map(motif['id'],motif['name'],motif['en'],0,0,[([points],None) for points in motif['contours']],'complex','上海博物馆 · 汉代四神瓦当纹样 · 轮廓提取与简化',planar=True)
 item['source']=artwork['source']
 out.append(item)
(base/'dist/countries.js').write_text('window.ATLAS_COUNTRIES='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n')
print('Maps:',len(out),'Contours:',sum(len(c['rings']) for c in out),'Bytes:',(base/'dist/countries.js').stat().st_size)
