"""
COCO 格式转 YOLO 格式脚本
用法: python coco2yolo.py --coco_json train.json --output_dir ./yolo_dataset
"""

import argparse
import json
import os
from pathlib import Path
from tqdm import tqdm


def coco2yolo(coco_json_path, output_dir, image_dir=None):
    """
    将 COCO 格式标注转换为 YOLO 格式

    Args:
        coco_json_path: COCO annotations.json 文件路径
        output_dir: 输出目录
        image_dir: 图片目录（如果不提供则尝试从 json 中推断）
    """
    # 读取 COCO json
    with open(coco_json_path, 'r', encoding='utf-8') as f:
        coco_data = json.load(f)

    # 创建输出目录
    output_dir = Path(output_dir)
    labels_dir = output_dir / 'labels'
    images_dir = output_dir / 'images'
    labels_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)

    # 构建 image_id -> image_info 映射
    images_map = {img['id']: img for img in coco_data['images']}

    # 类别映射 (COCO cat_id -> YOLO class_id 从 0 开始)
    categories = coco_data.get('categories', [])
    cat_id_map = {cat['id']: i for i, cat in enumerate(categories)}

    print(f"找到 {len(categories)} 个类别: {[c['name'] for c in categories]}")
    print(f"找到 {len(coco_data['images'])} 张图片")
    print(f"找到 {len(coco_data['annotations'])} 个标注")

    # 按图片分组标注
    annotations_by_image = {}
    for ann in coco_data['annotations']:
        img_id = ann['image_id']
        if img_id not in annotations_by_image:
            annotations_by_image[img_id] = []
        annotations_by_image[img_id].append(ann)

    # 转换每个图片的标注
    converted_count = 0
    for img_info in tqdm(coco_data['images'], desc="转换中"):
        img_id = img_info['id']
        img_width = img_info['width']
        img_height = img_info['height']
        img_filename = img_info['file_name']

        # 生成 YOLO label 文件名
        label_filename = Path(img_filename).stem + '.txt'
        label_path = labels_dir / label_filename

        # 获取该图片的所有标注
        img_annotations = annotations_by_image.get(img_id, [])

        # 写入 YOLO 格式标注
        with open(label_path, 'w', encoding='utf-8') as f:
            for ann in img_annotations:
                # COCO bbox 格式: [x, y, width, height] (左上角坐标)
                bbox = ann['bbox']
                x, y, w, h = bbox

                # 转换为 YOLO 格式: [class_id cx cy w h] (归一化)
                cx = (x + w / 2) / img_width
                cy = (y + h / 2) / img_height
                nw = w / img_width
                nh = h / img_height

                # 限制在 0-1 范围内
                cx = max(0, min(1, cx))
                cy = max(0, min(1, cy))
                nw = max(0, min(1, nw))
                nh = max(0, min(1, nh))

                class_id = cat_id_map.get(ann['category_id'], 0)

                f.write(f"{class_id} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}\n")

        # 复制图片到新目录
        if image_dir:
            src_img_path = Path(image_dir) / img_filename
            if src_img_path.exists():
                dst_img_path = images_dir / img_filename
                if not dst_img_path.exists():
                    import shutil
                    shutil.copy(src_img_path, dst_img_path)

        converted_count += 1

    print(f"\n转换完成! 共处理 {converted_count} 张图片")
    print(f"标注文件保存在: {labels_dir}")

    # 生成 data.yaml
    yaml_content = f"""# YOLO 数据集
path: {output_dir.absolute()}
train: images
val: images

# 类别数
nc: {len(categories)}

# 类别名称
names: {json.dumps([c['name'] for c in categories])}
"""
    yaml_path = output_dir / 'data.yaml'
    with open(yaml_path, 'w', encoding='utf-8') as f:
        f.write(yaml_content)
    print(f"配置文件: {yaml_path}")


def main():
    parser = argparse.ArgumentParser(description='COCO 转 YOLO 格式')
    parser.add_argument('--coco_json', required=True, help='COCO annotations.json 路径')
    parser.add_argument('--output_dir', required=True, help='输出目录')
    parser.add_argument('--image_dir', help='图片目录（可选）')

    args = parser.parse_args()

    coco2yolo(args.coco_json, args.output_dir, args.image_dir)


if __name__ == '__main__':
    main()
