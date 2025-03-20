#!/bin/bash
set -e

# 处理FLAG设置
echo "[+] 配置FLAG环境..."
if [ "$DASFLAG" ]; then
    INSERT_FLAG="$DASFLAG"
    export DASFLAG=no_FLAG
    DASFLAG=no_FLAG
elif [ "$FLAG" ]; then
    INSERT_FLAG="$FLAG"
    export FLAG=no_FLAG
    FLAG=no_FLAG
elif [ "$GZCTF_FLAG" ]; then
    INSERT_FLAG="$GZCTF_FLAG"
    export GZCTF_FLAG=no_FLAG
    GZCTF_FLAG=no_FLAG
else
    echo "[!] 未检测到FLAG环境变量，使用测试FLAG"
    INSERT_FLAG="flag{TEST_Dynamic_FLAG}"
fi

# 生成随机文件名并写入FLAG
echo "[+] 生成安全的FLAG存储..."
FLAG_FILENAME="/$(head -c 32 /dev/urandom | tr -dc 'a-zA-Z0-9')"
echo $INSERT_FLAG > $FLAG_FILENAME
export FLAG_FILENAME=$FLAG_FILENAME

chmod 744 $FLAG_FILENAME

echo "[+] 启动Flask应用..."
cd /app

exec flask run -h 0.0.0.0 -p 80