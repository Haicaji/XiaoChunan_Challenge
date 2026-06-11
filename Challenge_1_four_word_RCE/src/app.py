from flask import Flask, request, jsonify, send_from_directory
import os
import subprocess
import hashlib
import glob
import time
import json
import base64
import random

# 加载消息配置
try:
    with open(os.path.join(os.path.dirname(__file__), 'messages.json'), 'r', encoding='utf-8') as f:
        MESSAGES = json.load(f)
except Exception as e:
    print(f"无法加载消息配置: {e}")
    MESSAGES = {}

# 获取消息函数，如果消息不存在则返回默认值
def get_message(key, default="", **kwargs):
    message = MESSAGES.get(key, default)
    message_text = message.format(**kwargs) if kwargs else message
    # 返回消息文本和对应的音频路径
    audio_path = f"audio/messages/{key}.mp3"
    return message_text, audio_path

# 对字符串进行5次base64加密，第2-5次每次都添加前缀
def encrypt_flag_5_times(flag_text):
    result = flag_text
    for i in range(5):
        if i > 0:
            result = "嘿嘿, 还有一层" + result
        result = base64.b64encode(result.encode('utf-8')).decode('utf-8')
    return result

# 打乱字符串顺序的函数
def shuffle_string(text):
    char_list = list(text)
    random.shuffle(char_list)
    return ''.join(char_list)

flag_path = os.environ.get('FLAG_FILENAME')
if flag_path and os.path.exists(flag_path):
    try:
        with open(flag_path, 'r') as flag_file:
            flag = flag_file.read().strip()
    except Exception as e:
        flag = "flag文件读取失败"
else:
    flag = "flag文件不存在或路径错误"
# flag = "1"
# 记录每个IP地址最后一次请求的时间
last_request_time = {}
# 记录每个IP地址的尝试次数
try_times = {}
# 记录输入正确flag的次数
flag_times = {}
flag_times_tell = {}
greater_than_time = {}

app = Flask(__name__, static_url_path='')

# API端点
@app.route('/api/execute', methods=['POST'])
def execute_command():
    # 获取用户IP
    ip = request.remote_addr
    current_time = time.time()
    
    # 检查时间间隔
    if ip in last_request_time:
        time_diff = current_time - last_request_time[ip]
        if time_diff < 2:
            message, audio = get_message("rate_limit")
            return jsonify({"message": message, "audio": audio})
    
    # 更新最后请求时间
    last_request_time[ip] = current_time
    
    # 更新尝试次数
    if ip not in try_times:
        try_times[ip] = 0
    try_times[ip] += 1
    if ip not in flag_times:
        flag_times[ip] = 0
    if ip not in flag_times_tell:
        flag_times_tell[ip] = 0
    if ip not in greater_than_time:
        greater_than_time[ip] = 0
    
    data = request.get_json()
    cmd = data.get('cmd', '')
    if flag_times_tell[ip] < flag_times[ip]:
        flag_times_tell[ip] += 1
        message, audio = get_message("flag_times_tell")
        return jsonify({"message": message, "audio": audio})

    if len(cmd) == 0:
        message, audio = get_message("command_empty")
        return jsonify({"message": message, "audio": audio})
    elif len(cmd) <= 4:
        sandbox_dir = create_sandbox()
        os.chdir(sandbox_dir)
        # 执行命令
        try:
            subprocess.run(cmd, shell=True)

            # 查找所有文件
            for filepath in glob.glob(f"{sandbox_dir}/*"):
                if os.path.isfile(filepath):
                    try:
                        with open(filepath, 'r') as file:
                            content = file.read().strip()
                            if content == "love":
                                message, audio = get_message("love_found")
                                return jsonify({"message": message, "audio": audio})
                            elif content == 'Love':
                                # 只对Love情况加密
                                encrypted_flag = encrypt_flag_5_times(flag)
                                message, audio = get_message("love_found_2", flag=encrypted_flag)
                                return jsonify({"message": message, "audio": audio})
                            elif content == 'LOVE':
                                message, audio = get_message("love_found_3", flag=flag)
                                return jsonify({"message": message, "audio": audio})
                            elif content.lower() == 'love':
                                # 随机打乱flag字符顺序
                                shuffled_flag = shuffle_string(flag)
                                message, audio = get_message("love_case_found", flag=shuffled_flag)
                                return jsonify({"message": "'"+content+"'"+message, "audio": audio})
                    except:
                        pass

            if cmd.lower() == 'ls':
                message, audio = get_message("ls_executed")
                return jsonify({"message": message, "audio": audio})
            if 'cat' in cmd.lower():
                message, audio = get_message("cat_executed")
                return jsonify({"message": message, "audio": audio})
            if 'flag' in cmd.lower():
                message, audio = get_message("flag_executed")
                return jsonify({"message": message, "audio": audio})
            if 'dir' in cmd.lower():
                message, audio = get_message("dir_executed")
                return jsonify({"message": message, "audio": audio})
            if 'rev' in cmd.lower():
                message, audio = get_message("rev_executed")
                return jsonify({"message": message, "audio": audio})
            if r'*' in cmd.lower():
                message, audio = get_message("star_executed")
                return jsonify({"message": message, "audio": audio})
            if r'>' in cmd.lower() and greater_than_time[ip] == 0:
                greater_than_time[ip] += 1
                message, audio = get_message("greater_than_executed")
                return jsonify({"message": message, "audio": audio})
            if 'sh' in cmd.lower():
                message, audio = get_message("sh_executed")
                return jsonify({"message": message, "audio": audio})
            if 'Love' in cmd or 'LOVE' in cmd or 'love' in cmd:
                message, audio = get_message("Love_executed")
                return jsonify({"message": message, "audio": audio})
            if 'love' in cmd.lower() and 'love' not in cmd and 'LOVE' not in cmd:
                message, audio = get_message("love_case_executed")
                return jsonify({"message": message, "audio": audio})
            
            # 根据IP对应的尝试次数返回不同信息
            if try_times[ip] > 20:
                message, audio = get_message("tries_over_20")
                return jsonify({"message": message, "audio": audio})
            elif try_times[ip] > 10:
                message, audio = get_message("tries_over_10")
                return jsonify({"message": message, "audio": audio})
            elif try_times[ip] > 5:
                message, audio = get_message("tries_over_5")
                return jsonify({"message": message, "audio": audio})
            else:
                message, audio = get_message("no_love_file")
                return jsonify({"message": message, "audio": audio})
        except Exception as e:
            message, audio = get_message("error")
            return jsonify({"message": message, "audio": audio})
    elif len(cmd) == 5:
        message, audio = get_message("length_5")
        return jsonify({"message": message, "audio": audio})
    elif len(cmd) > 10:
        message, audio = get_message("length_over_10")
        return jsonify({"message": message, "audio": audio})
    else:
        message, audio = get_message("length_over_4")
        return jsonify({"message": message, "audio": audio})

@app.route('/api/reset', methods=['POST'])
def reset_sandbox():
    # 获取用户IP
    ip = request.remote_addr
    current_time = time.time()
    
    # 检查时间间隔
    if ip in last_request_time:
        time_diff = current_time - last_request_time[ip]
        if time_diff < 2:
            message, audio = get_message("rate_limit")
            return jsonify({"message": message, "audio": audio})
    
    # 更新最后请求时间
    last_request_time[ip] = current_time
    
    # 重置该IP的尝试次数
    try_times[ip] = 0
    greater_than_time[ip] = 0
    
    sandbox_dir = create_sandbox()
    try:
        subprocess.run(f'rm -rf {sandbox_dir}', shell=True)
        create_sandbox()
        message, audio = get_message("sandbox_reset")
        return jsonify({"message": message, "audio": audio})
    except Exception as e:
        message, audio = get_message("sandbox_reset_failed")
        return jsonify({"message": message, "audio": audio})

def create_sandbox():
    # 获取用户IP地址
    ip = request.remote_addr
    # 创建sandbox目录
    sandbox_dir = '/www/sandbox/' + hashlib.md5(f"orange{ip}".encode()).hexdigest()
    os.makedirs(sandbox_dir, exist_ok=True)
    return sandbox_dir

@app.route('/api/submit-flag', methods=['POST'])
def submit_flag():
    # 获取用户IP
    ip = request.remote_addr
    current_time = time.time()
    
    # 检查时间间隔
    if ip in last_request_time:
        time_diff = current_time - last_request_time[ip]
        if time_diff < 2:
            message, audio = get_message("rate_limit")
            return jsonify({"message": message, "audio": audio})
    
    # 更新最后请求时间
    last_request_time[ip] = current_time
    
    data = request.get_json()
    submitted_flag = data.get('flag', '').strip()
    
    # 检查提交的flag是否为空
    if not submitted_flag:
        message, audio = get_message("flag_empty")
        return jsonify({
            "message": message, 
            "audio": audio,
            "correct": False
        })
    
    # 检查提交的flag是否正确
    if submitted_flag == flag:
        # 正确的flag
        if flag_times_tell[ip] == flag_times[ip]:
            flag_times[ip] += 1
        
        # 重置沙盒环境
        try:
            # 重置该IP的尝试次数
            try_times[ip] = 0
            
            # 获取沙盒目录并重置
            sandbox_dir = create_sandbox()
            subprocess.run(f'rm -rf {sandbox_dir}', shell=True)
            create_sandbox()
            print(f"Flag 验证成功，已重置用户 {ip} 的沙盒")
        except Exception as e:
            print(f"重置沙盒失败: {e}")
        
        if flag_times[ip] == 1:
            message, audio = get_message("flag_correct")
            return jsonify({
                "message": message,
                "audio": audio,
                "correct": True
            })
        else:
            message, audio = get_message("flag_correct_2")
            return jsonify({
                "message": message,
                "audio": audio,
                "correct": True,
                "show_compensation": True  # 添加标记，告诉前端显示补偿按钮
            })
    else:
        # 不正确的flag
        message, audio = get_message("flag_incorrect")
        return jsonify({
            "message": message,
            "audio": audio,
            "correct": False
        })

@app.route('/api/decode-base64', methods=['POST'])
def decode_base64():
    data = request.get_json()
    encoded_text = data.get('text', '')
    
    if not encoded_text:
        # 空输入时也返回音频路径
        message, audio = get_message("base64_input_empty")
        return jsonify({
            "success": False,
            "message": message,
            "audio": audio
        })
    
    try:
        # 尝试解码Base64
        decoded_bytes = base64.b64decode(encoded_text)
        result = decoded_bytes.decode('utf-8')
        
        # 检查是否为特定的解码内容
        if "诶嘿, 上当了吧" in result:
            message, audio = get_message("got_tricked")
            return jsonify({
                "success": True,
                "result": result,
                "audio": audio
            })
        if "嘿嘿, 还有一层" in result:
            message, audio = get_message("got_tricked_2")
            return jsonify({
                "success": True,
                "result": result,
                "audio": audio
            })
        else:
            return jsonify({
                "success": True,
                "result": result
            })
    except Exception as e:
        # 解码失败时也返回音频路径
        message, audio = get_message("base64_decode_error", error=str(e))
        return jsonify({
            "success": False,
            "message": message,
            "audio": audio
        })

# 提供静态文件
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    # 确保沙盒基础目录存在
    os.makedirs('/www/sandbox', exist_ok=True)
    # 确保static目录存在
    os.makedirs(os.path.join(os.path.dirname(__file__), 'static', 'audio', 'messages'), exist_ok=True)
    app.run(host='0.0.0.0', port=80)
