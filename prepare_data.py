"""Generate fixed, local Fourier data from Natural Earth 1:110m GeoJSON.
Projection: locally centered equirectangular, standard parallel at lat0.
All external polygon rings are retained, except French Guiana for metropolitan France.
512 equal-arclength samples per ring; DC position plus 128 largest nonzero coefficients.
"""
import json, math
from pathlib import Path
import numpy as np
base=Path(__file__).parent
features=json.loads((base/'countries-source.geojson').read_text())['features']
choices=[('CHN','中国','China',105,35),('USA','美国','United States',-100,39),('CAN','加拿大','Canada',-105,60),('BRA','巴西','Brazil',-52,-10),('GBR','英国','United Kingdom',-3,55),('FRA','法国','France',2,47),('RUS','俄罗斯','Russia',100,60),('IND','印度','India',79,22),('JPN','日本','Japan',138,37),('AUS','澳大利亚','Australia',134,-25)]
out=[]
for code,name,en,lon0,lat0 in choices:
 f=next(f for f in features if f['properties']['ADM0_A3']==code)
 polygons=f['geometry']['coordinates'] if f['geometry']['type']=='MultiPolygon' else [f['geometry']['coordinates']]
 rings=[]
 for poly in polygons:
  ring=poly[0]
  if code=='FRA' and sum(p[1] for p in ring)/len(ring)<30:continue
  xy=np.array([[(((p[0]-lon0+180)%360)-180)*math.cos(math.radians(lat0)),-(p[1]-lat0)] for p in ring])
  if np.linalg.norm(xy[0]-xy[-1])<1e-8:xy=xy[:-1]
  # Remove coincident vertices before interpolating.
  xy=xy[np.r_[True,np.linalg.norm(np.diff(xy,axis=0),axis=1)>1e-9]]
  xy=np.vstack([xy,xy[0]])
  cum=np.r_[0,np.cumsum(np.linalg.norm(np.diff(xy,axis=0),axis=1))]
  d=np.arange(512)/512*cum[-1]
  z=np.interp(d,cum,xy[:,0])+1j*np.interp(d,cum,xy[:,1])
  c=np.fft.fft(z)/512
  order=sorted(range(1,512),key=lambda k:abs(c[k]),reverse=True)[:128]
  rings.append({'points':np.round(xy,5).tolist(),'center':[round(c[0].real,6),round(c[0].imag,6)],'length':round(cum[-1],5),'terms':[[k if k<=256 else k-512,round(abs(c[k]),7),round(float(np.angle(c[k])),7)] for k in order], 'energy':round(float(np.sum(np.abs(c[1:])**2)),8)})
 rings.sort(key=lambda r:r['length'],reverse=True)
 out.append({'id':code,'name':name,'en':en,'rings':rings,'note':'欧洲本土与科西嘉岛' if code=='FRA' else '包含数据中的全部陆地外轮廓'})
(base/'dist/countries.js').write_text('window.ATLAS_COUNTRIES='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n')
print('Countries:',len(out),'Contours:',sum(len(c['rings']) for c in out),'Bytes:',(base/'dist/countries.js').stat().st_size)
