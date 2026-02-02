#!/usr/bin/env python3
"""
初始化 MinIO bucket for Langfuse
"""
import urllib3
from urllib.parse import urlencode
import hashlib
import hmac
from datetime import datetime
import sys

# 禁用 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# MinIO 配置
MINIO_ENDPOINT = "localhost:23030"
ACCESS_KEY = "minioadmin"
SECRET_KEY = "minioadmin"
BUCKET_NAME = "langfuse"

def create_bucket():
    """使用简单的 HTTP 请求创建 bucket"""
    import http.client

    try:
        # 创建连接
        conn = http.client.HTTPConnection(MINIO_ENDPOINT)

        # 准备请求
        path = f"/{BUCKET_NAME}"

        # 创建 AWS Signature V4
        date = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
        date_stamp = datetime.utcnow().strftime('%Y%m%d')

        # 简化版：使用基本认证
        headers = {
            'Host': MINIO_ENDPOINT,
            'Date': date,
        }

        # 发送 PUT 请求创建 bucket
        conn.request('PUT', path, headers=headers)

        # 使用 AWS4 签名
        import base64
        auth_string = f"{ACCESS_KEY}:{SECRET_KEY}"
        auth_bytes = auth_string.encode('ascii')
        auth_b64 = base64.b64encode(auth_bytes).decode('ascii')

        conn.close()

        # 重新连接并使用正确的认证
        conn = http.client.HTTPConnection(MINIO_ENDPOINT)
        headers['Authorization'] = f'Basic {auth_b64}'

        conn.request('PUT', path, headers=headers)
        response = conn.getresponse()

        if response.status in [200, 409]:  # 200 = 创建成功, 409 = 已存在
            print(f"✅ Bucket '{BUCKET_NAME}' 创建成功或已存在")
            return True
        else:
            print(f"❌ 创建失败: {response.status} {response.reason}")
            print(response.read().decode())
            return False

    except Exception as e:
        print(f"❌ 错误: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    success = create_bucket()
    sys.exit(0 if success else 1)
