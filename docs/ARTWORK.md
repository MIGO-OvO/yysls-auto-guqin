# 界面画作

2026-11-13 使用内置 imagegen 接口生成，随后以原始 PNG 文件复制到项目。接口不提供型号选择，因此不将这些素材标记为 image-2.6 输出。

| 素材                               | 用途                 |
| ---------------------------------- | -------------------- |
| `src/assets/distant-mountains.png` | 曲名栏右侧的淡墨远山 |
| `src/assets/pine-branch.png`       | 曲库留白中的松枝     |

画作通过 CSS 与米色底色融合，不参与点击和无障碍名称。深色主题使用低透明度的灰度版本。项目副本随应用离线打包。

远山使用透明背景参数，最终提示词：

```text
Use case: stylized-concept. Asset type: finished decorative raster illustration for the header of a Chinese guqin music editor desktop app, not a UI mockup. Create an exquisitely restrained traditional Chinese shanshui ink-wash landscape: two very distant misty mountain ridges, one small low pine silhouette on a rocky riverbank, calm negative space, delicate dry brush texture. Horizontal panoramic composition, approximately 3:1 width to height, all imagery concentrated toward the lower right and lower edge, the upper left largely empty. Colors limited to muted pine green #4A6741, warm stone gray, and very pale diluted ink; no black. Transparent background, fading edges and generous empty margins so the illustration can sit unobtrusively on warm beige #EEEAE2 UI surfaces. The artwork should feel like a small literati album leaf, refined, light, calm, slightly asymmetrical, made for a professional dense working interface. No words, no calligraphy, no seal, no border, no moon, no people, no buildings, no paper rectangle, no gradients of colored light, no interface, no mockup.
```

松枝使用白色背景，最终提示词：

```text
Use case: stylized-concept. Asset type: small botanical decorative painting for an elegant warm-beige guqin desktop music editor sidebar. One slender graceful pine branch with exactly three small airy needle clusters and a tiny pinecone, approximately square composition, generous blank margin. Fine traditional Chinese gongbi and dry-brush ink illustration, delicate muted pine green #4A6741, warm gray-brown branch, desaturated sage details, very low density, exceptionally restrained. Paint it on a perfectly flat pure WHITE background (#FFFFFF), no paper texture, no gradients, no shadows. Opaque clean raster illustration with extremely clean edges, no transparency or alpha effects. The pure white background is essential so the frontend can blend the painting naturally onto a beige surface. No text, no calligraphy, no stamp, no red seal, no colored fringes or glow, no borders, no people, no mountains, no flowers, no UI, no mockup.
```
