# Fourier Atlas / 傅里叶地图实验室

十国与八个中国省区的傅里叶本轮绘图网页。中国地图含台湾、海南等陆地轮廓。使用真实地理外轮廓，从每轮廓 1 个非零频率项开始，每完成一圈增加 1 项，默认到 64 项，可选择 32 或 128 项。

## 预览

在项目目录运行 `python3 -m http.server 4173 --directory dist`，打开 http://localhost:4173 。无安装、构建或外部运行时依赖。

## 交互

- 切换中国、美国、加拿大、巴西、英国、法国、俄罗斯、印度、日本、澳大利亚。
- 在「中国省区」切换新疆、西藏、内蒙古、青海、四川、黑龙江、甘肃、云南，省级行政区名称以完整名称显示。
- 播放/暂停、从 1 开始、下一圈；设置每圈 0.5–6 秒。
- 自动增加模式每圈增加 1 个圆，圈间停留 0.55 秒，达到上限后停止；取消自动增加则固定当前数量循环。
- 拖动数量滑块或点击阶段缩略图时暂停，展示完整的对应近似轮廓；播放时从下一圈继续。
- 减少动态效果偏好下初始暂停；后台标签页暂停时间推进。

## 数据和数学

数据来源：[Natural Earth 1:110m Admin 0 – Countries](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/)，公共领域。
原始文件为 `countries-source.geojson`，取自 [Natural Earth 官方仓库](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson)。

`prepare_data.py` 使用 NumPy 重新生成 `dist/countries.js`。每个外轮廓采用以本地纬度为标准纬线的等距圆柱投影，512 点按弧长等距采样。复数 FFT 的常数项是位置，非零项按幅度降序取前 128 项。负频率表示反向旋转。所有外轮廓独立处理，避免人为跨海连线。面积内孔洞不展示；法国仅取欧洲本土与科西嘉岛，其他国家保留该尺度数据的全部陆地外轮廓。小岛和海岸线以低分辨率数据为准，不代表高精度测绘。

按幅度排序加入系数使采样均方误差随项数增加而不增，不保证每一局部点的偏差都单调减少。

## 省级行政区与台湾轮廓

省区来源：[Natural Earth 1:50m Admin 1](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-1-states-provinces/)，同为公共领域，原始数据保存于 `provinces-source.geojson`。所选 8 个省级行政区按 ISO 3166-2 编码匹配。中国选择将原国家数据中的台湾几何并入同一投影与同一画布，独立计算傅里叶系数并标注台湾，不绘制跨海连接线。
