#!/usr/bin/env python3
"""
图片压缩脚本
压缩 references 目录下的图片
"""

from PIL import Image
import os

def compress_image(input_path: str, output_path: str, max_size: int = 1200, quality: int = 85):
    """
    压缩图片

    Args:
        input_path: 输入图片路径
        output_path: 输出图片路径
        max_size: 最大边长（像素）
        quality: JPEG 质量 (1-100)
    """
    with Image.open(input_path) as img:
        # 获取原始尺寸
        original_size = img.size
        print(f"原始尺寸: {original_size[0]}x{original_size[1]}")

        # 计算缩放比例
        ratio = min(max_size / original_size[0], max_size / original_size[1])

        if ratio < 1:
            new_size = (int(original_size[0] * ratio), int(original_size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            print(f"压缩后尺寸: {new_size[0]}x{new_size[1]}")
        else:
            print("图片尺寸已小于目标，保持原尺寸")

        # 转换为 RGB（处理 PNG 透明通道）
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # 保存
        img.save(output_path, 'JPEG', quality=quality, optimize=True)

        # 显示文件大小变化
        original_file_size = os.path.getsize(input_path) / 1024
        new_file_size = os.path.getsize(output_path) / 1024
        print(f"文件大小: {original_file_size:.1f}KB -> {new_file_size:.1f}KB")
        print()


def main():
    # 要压缩的图片列表
    images = [
        "image.png",
        "image copy.png",
        "image copy 2.png",
    ]

    script_dir = os.path.dirname(os.path.abspath(__file__))

    for img_name in images:
        input_path = os.path.join(script_dir, img_name)

        if not os.path.exists(input_path):
            print(f"跳过: {img_name} (文件不存在)")
            continue

        # 输出文件名
        base_name = os.path.splitext(img_name)[0]
        output_path = os.path.join(script_dir, f"{base_name}_compressed.jpg")

        print(f"处理: {img_name}")
        compress_image(input_path, output_path, max_size=1200, quality=85)


if __name__ == "__main__":
    main()
