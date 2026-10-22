# Fourier Atlas / 傅里叶地图实验室

用一串旋转圆描绘地图与复杂曲线。包含 10 个国家、人口前十省区和 8 种数学图形；支持渐增或固定步长、最多 1024 个圆、历史轨迹叠加与阶段对比，默认终点 512。

Draw maps and intricate curves with rotating Fourier epicycles. Explore 10 countries, 10 populous provinces and 8 mathematical shapes, with adaptive or fixed increments, up to 1,024 circles, continuous playback and fading history. The default endpoint is 512.

![Fourier Atlas screenshot](./assets/screenshot.png)

## 在线体验 / Live Demo

- [Cloudflare Demo](https://fourier-atlas.xiaosang.cc/)
- [GitHub Repo](https://github.com/holynova/fourier-atlas)

<img src="./assets/qr.png" width="180" alt="扫码访问 Fourier Atlas">

## 本地运行 / Run locally

```bash
npm ci
npm run dev
```

打开 / Open `http://localhost:4173`.

## 检查与发布 / Check and deploy

```bash
npm run check
npm run deploy:check
npm run deploy
```

Cloudflare Workers · `fourier-atlas.xiaosang.cc` · v1.0.0

源码与部署配置统一使用 `main`，从同一提交手动发布。生产资源位于 `dist/`，无需构建。用 NumPy 运行 `prepare_data.py` 可重新生成傅里叶系数。

Source and deployment configuration share `main`. Deploy manually from the same commit. The buildless static output lives in `dist/`. Run `prepare_data.py` with NumPy to regenerate coefficients.
