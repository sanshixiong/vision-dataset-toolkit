# 工业视觉数据集工具箱

训练数据质检、清洗、增强与交付工具预演。

面向工业视觉训练数据的浏览器端工具，聚焦数据集质检、图片清洗、样本增强与训练前风险发现。

## 功能特性

### 1. 图像预处理体检
- 图片缩放、归一化与 Tensor 转换
- 预处理耗时与输入尺寸检查
- 为训练数据质检和后续推理链路提供基础处理能力

### 2. 图片元数据
- 读取 EXIF 拍摄时间
- 展示相机、方向、GPS 等元数据
- 为图片检测前处理提供摘要信息

### 3. 数据清洗
- 图片重复检测
- 清洗结果预览
- 数据集整理辅助

### 4. 图片清晰度分析
- 批量计算清晰度评分
- 支持目标区域框选分析
- 辅助筛除模糊、低质量训练样本

### 5. 样本增强
- 图片增强预览
- 批量增强处理
- 训练样本扩展辅助

## 推荐演进方向

### YOLO 数据集校验
- 校验 `data.yaml`、图片目录与标签目录是否完整
- 检查图片与 `.txt` 标签是否一一对应
- 校验 YOLO 标注格式、类别 ID、归一化坐标与越界框
- 统计类别分布、目标数量、空标注比例和异常框
- 在图片上叠加标注框，快速预览错标、漏标与偏移问题

### 数据集健康报告
- 输出数据完整性、图片质量、标注质量与类别均衡评分
- 生成问题样本清单、处理参数与 Markdown/JSON 报告
- 支持清洗、增强、切分前后的数据变化对比

## 技术栈

- **框架**: Vue 3 + Composition API
- **构建**: Vite 5
- **核心**: 图像预处理、元数据读取、数据清洗、清晰度分析与样本增强
- **扩展方向**: YOLO 数据集校验、标注质量分析、训练前数据健康报告

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build
```

## 浏览器兼容性

建议使用支持 Canvas、Web Worker 与现代 ES 模块的主流浏览器，例如 Chrome、Edge、Safari 或 Firefox 的较新版本。

## 项目结构

```
vision-dataset-toolkit/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.js
    ├── App.vue              # 主组件
    ├── components/          # 演示模块组件
    └── utils/
      ├── data-cleaner.js      # 数据清洗工具
      ├── image-metadata.js    # 图片元数据工具
      ├── image-augmenter.js   # 样本增强工具
      └── webnn-runner.js      # 图像预处理与 Tensor 转换工具
```

## 与 detection 项目结合

### 场景 1: 训练前数据体检
```javascript
// 在上传或训练前做图片预处理检查
const preprocessor = new WebNNRunner()
await preprocessor.preprocessImage(imageFile)
```

### 场景 2: 数据清洗
```javascript
// 重复样本筛选与清洗结果预览
// 具体调用方式见 src/components/DataCleanDemo.vue
```

### 场景 3: 图片元数据预处理
```javascript
import { readImagePreprocessMetadata } from '@/utils/image-metadata.js'

const metadata = await readImagePreprocessMetadata(file)

// 仅读取 EXIF 拍摄/创建时间，不使用文件修改时间
console.log(metadata.createdAt)
```

### 场景 4: YOLO 数据集校验

后续可基于 `public/dataset/yolo` 中的 `data.yaml`、`images` 与 `labels` 增加专项校验页面，检查标签格式、坐标范围、类别分布与标注框可视化效果。

## License

MIT
