# 基础镜像
FROM python:3.8-slim-bullseye

# 制作者信息
LABEL auther_template="Haicaji"

# apt更换镜像源，并更新软件包列表信息
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list && \
    sed -i 's/security.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y bash coreutils && \
    rm -rf /var/lib/apt/lists/*

RUN ln -sf /bin/bash /bin/sh

# 安装Python依赖
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple flask

# 拷贝源码和启动脚本至根目录
COPY ./src/ /app
COPY ./service/docker-entrypoint.sh /

# 根据题目提前创建沙盒目录并授权
RUN mkdir -p /www/sandbox
# RUN chown -R www-data:www-data /www

# 暴露端口
EXPOSE 80

# 容器入口点
ENTRYPOINT ["/bin/bash", "/docker-entrypoint.sh"]