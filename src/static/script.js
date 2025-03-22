document.addEventListener('DOMContentLoaded', function() {
    // 幻动片动画控制
    const introAnimation = document.getElementById('intro-animation');
    const mainContent = document.getElementById('main-content');
    const animationTexts = document.querySelectorAll('.animation-text');
    const titleAudio = document.getElementById('audio-title');
    
    // 创建动画索引到音频ID的映射
    const audioMapping = {
        6: 'audio-5',  // "萧楚楠, 你终于来了"
        8: 'audio-7',  // "flag放在我心里了"
        9: 'audio-8',  // "我只会把它给爱我的人"
        11: 'audio-10', // "可是我心里没看到你的爱呀"
        13: 'audio-12'  // "给你个机会, 让我看看你的爱吧"
    };
    
    // 预加载所有音频
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
        audio.load();
        // 添加加载完成事件监听
        audio.addEventListener('canplaythrough', () => {
            console.log(`音频加载完成: ${audio.id}`);
        });
        // 添加错误监听
        audio.addEventListener('error', (e) => {
            console.error(`音频加载失败: ${audio.id}`, e);
        });
    });
    
    // 执行动画
    let currentTextIndex = 0;
    
    function showText(index) {
        if (index >= animationTexts.length) {
            // 动画完成，显示主内容
            introAnimation.style.opacity = 0;
            setTimeout(() => {
                introAnimation.style.display = 'none';
                mainContent.style.display = 'block';
                // 添加淡入效果
                setTimeout(() => {
                    mainContent.style.opacity = 1;
                    // 播放标题音频（使用用户交互后播放）
                    playAudioWithFallback(titleAudio, '标题');
                }, 100);
            }, 1500);
            return;
        }
        
        // 显示当前文本
        const currentText = animationTexts[index];
        currentText.style.opacity = 1;
        
        // 获取自定义显示时间，如果未设置则默认为2500ms
        const displayDuration = parseInt(currentText.getAttribute('data-duration')) || 2500;
        
        // 检查是否需要播放音频
        if (currentText.getAttribute('data-audio') === 'true') {
            // 使用映射表获取正确的音频ID
            const audioId = audioMapping[index];
            const audio = document.getElementById(audioId);
            if (audio) {
                playAudioWithFallback(audio, `文本索引 ${index}`);
            } else {
                console.error(`找不到音频元素: ${audioId} 对应索引 ${index}`);
            }
        }
        
        // 使用自定义时间后淡出
        setTimeout(() => {
            currentText.style.opacity = 0;
            // 淡出后显示下一条
            setTimeout(() => {
                showText(index + 1);
            }, 1500);
        }, displayDuration);
    }
    
    // 增强的音频播放函数，带有回退和错误处理
    function playAudioWithFallback(audioElement, name) {
        if (!audioElement) {
            console.error(`音频元素不存在: ${name}`);
            return;
        }
        
        console.log(`尝试播放音频: ${name}`);
        
        // 检查音频状态
        if (audioElement.readyState < 2) {
            console.warn(`音频未完全加载: ${name}, 状态: ${audioElement.readyState}`);
        }
        
        // 重置音频位置
        audioElement.currentTime = 0;
        
        // 播放音频，使用静音后自动播放的方式
        audioElement.play().then(() => {
            console.log(`音频开始播放: ${name}`);
            // 确保声音正常
            audioElement.muted = false;
        }).catch(e => {
            console.error(`音频播放失败: ${name}`, e);
            // 尝试静音播放，然后取消静音（解决自动播放限制）
            audioElement.muted = true;
            audioElement.play().then(() => {
                setTimeout(() => {
                    audioElement.muted = false;
                    console.log(`通过静音方式播放音频: ${name}`);
                }, 100);
            }).catch(err => {
                console.error(`无法以任何方式播放音频: ${name}`, err);
            });
        });
    }
    
    // 管理消息音频的对象
    const messageAudio = {
        element: null,
        currentSrc: null,
        
        // 加载并播放消息音频
        play: function(audioSrc) {
            if (!audioSrc) return;
            
            // 如果当前没有音频元素，创建一个
            if (!this.element) {
                this.element = document.createElement('audio');
                this.element.style.display = 'none';
                document.body.appendChild(this.element);
            }
            
            // 如果是新的音频源，则加载
            if (this.currentSrc !== audioSrc) {
                this.currentSrc = audioSrc;
                this.element.src = audioSrc;
                this.element.load();
            }
            
            // 播放音频
            playAudioWithFallback(this.element, '消息音频');
        }
    };
    
    // 开始动画
    showText(0);
    
    // 以下是原有功能代码
    const cmdInput = document.getElementById('cmd-input');
    const executeBtn = document.getElementById('execute-btn');
    const resetBtn = document.getElementById('reset-btn');
    const feedback = document.getElementById('feedback');
    
    // 执行命令按钮点击事件
    executeBtn.addEventListener('click', function() {
        const cmd = cmdInput.value.trim();
        executeCommand(cmd);
    });
    
    // 重置沙盒按钮点击事件
    resetBtn.addEventListener('click', function() {
        resetSandbox();
    });
    
    // 命令输入框回车事件
    cmdInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            executeBtn.click();
        }
    });
    
    // 执行命令函数
    function executeCommand(cmd) {
        // 清空输入框
        cmdInput.value = '';
        
        fetch('/api/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ cmd: cmd })
        })
        .then(response => response.json())
        .then(data => {
            showFeedback(data.message);
            // 播放服务器返回的音频
            if (data.audio) {
                messageAudio.play(data.audio);
            }
        })
        .catch(error => {
            showFeedback("萧楚南, 你对我做了什么? 怎么我找不到你了");
            // 播放错误音频
            const errorAudio = document.getElementById('audio-error');
            if (errorAudio) {
                playAudioWithFallback(errorAudio, '错误音频');
            }
        });
    }
    
    // 重置沙盒函数
    function resetSandbox() {
        fetch('/api/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            showFeedback(data.message);
            // 播放服务器返回的音频
            if (data.audio) {
                messageAudio.play(data.audio);
            }
        })
        .catch(error => {
            showFeedback("萧楚南, 你对我做了什么? 怎么我找不到你了");
            // 播放错误音频
            const errorAudio = document.getElementById('audio-error');
            if (errorAudio) {
                playAudioWithFallback(errorAudio, '错误音频');
            }
        });
    }
    
    // 显示反馈信息，不区分类型
    function showFeedback(text) {
        feedback.textContent = text;
        feedback.className = 'status-message';
    }

    // Base64解码工具功能
    const encodedInput = document.getElementById('encoded-input');
    const decodedOutput = document.getElementById('decoded-output');
    const decodeBtn = document.getElementById('decode-btn');
    const clearBtn = document.getElementById('clear-btn');
    const toggleDecoderBtn = document.getElementById('toggle-decoder');
    const decoderContainer = document.getElementById('decoder-container');
    
    // 切换解码工具显示/隐藏
    toggleDecoderBtn.addEventListener('click', function() {
        decoderContainer.style.display = 'block';
        // 隐藏按钮
        toggleDecoderBtn.style.display = 'none';
        
        // 播放神秘小工具音频
        const secretAudio = document.getElementById('audio-secret');
        if (secretAudio) {
            playAudioWithFallback(secretAudio, '神秘小工具音频');
        }
        
        // 平滑滚动到解码工具位置
        decoderContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    
    // 单次解码按钮点击事件
    decodeBtn.addEventListener('click', function() {
        const encodedText = encodedInput.value.trim();
        
        // 直接发送请求，无需前端验证
        fetch('/api/decode-base64', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: encodedText })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                decodedOutput.value = data.result;
                // 检查是否包含音频
                if (data.audio) {
                    messageAudio.play(data.audio);
                }
            } else {
                decodedOutput.value = data.message || '解码失败，请重试';
                // 检查错误响应中是否也包含音频
                if (data.audio) {
                    messageAudio.play(data.audio);
                }
            }
        })
        .catch(error => {
            showFeedback("萧楚南, 你对我做了什么? 怎么我找不到你了");
            // 播放错误音频
            const errorAudio = document.getElementById('audio-error');
            if (errorAudio) {
                playAudioWithFallback(errorAudio, '错误音频');
            }
            decodedOutput.value = "萧楚南, 你对我做了什么? 怎么我找不到你了";
        });
    });
    
    // 清空按钮点击事件
    clearBtn.addEventListener('click', function() {
        encodedInput.value = '';
        decodedOutput.value = '';
    });

    // Flag提交功能
    const flagInput = document.getElementById('flag-input');
    const submitFlagBtn = document.getElementById('submit-flag-btn');

    // Flag提交按钮点击事件
    submitFlagBtn.addEventListener('click', function() {
        const flag = flagInput.value.trim();
        
        // 清空输入框
        flagInput.value = '';
        
        fetch('/api/submit-flag', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ flag: flag })
        })
        .then(response => response.json())
        .then(data => {
            // 显示反馈消息
            showFeedback(data.message || '提交失败');
            
            // 播放服务器返回的音频
            if (data.audio) {
                messageAudio.play(data.audio);
            }
            
            // 如果flag正确，隐藏Base64工具并清空内容
            if (data.correct === true) {
                if (decoderContainer.style.display === 'block') {
                    // 清空工具内的输入输出
                    encodedInput.value = '';
                    decodedOutput.value = '';
                    
                    // 隐藏工具
                    decoderContainer.style.display = 'none';
                    
                    // 如果你想在flag正确后完全禁用工具按钮，可以添加这行
                    toggleDecoderBtn.style.display = 'none';
                }
                
                copyToClipboard("萧楚楠, 你的Flag被我偷走了, 嘿嘿");
                
                // 检查是否需要显示补偿按钮
                if (data.show_compensation) {
                    showCompensationButton();
                }
            }
        })
        .catch(error => {
            showFeedback("萧楚南, 你对我做了什么? 怎么我找不到你了");
            // 播放错误音频
            const errorAudio = document.getElementById('audio-error');
            if (errorAudio) {
                playAudioWithFallback(errorAudio, 'Flag提交错误音频');
            }
        });
    });

    // 新增：显示补偿按钮的函数
    function showCompensationButton() {
        // 检查是否已存在补偿按钮，避免重复创建
        if (document.getElementById('compensation-btn')) {
            return;
        }
        
        // 创建按钮容器
        const compensationContainer = document.createElement('div');
        compensationContainer.className = 'compensation-container';
        compensationContainer.style.textAlign = 'center';
        compensationContainer.style.marginTop = '20px';
        
        // 创建按钮
        const compensationBtn = document.createElement('button');
        compensationBtn.id = 'compensation-btn';
        compensationBtn.className = 'btn';
        compensationBtn.textContent = '补偿';
        compensationBtn.style.backgroundColor = '#ff6b81';
        compensationBtn.style.padding = '10px 30px';
        compensationBtn.style.fontSize = '18px';
        
        // 添加点击事件
        compensationBtn.addEventListener('click', function() {
            window.open('https://search.bilibili.com/all?keyword=%E5%85%94%E5%A8%98', '_blank');
        });
        
        // 添加到DOM中
        compensationContainer.appendChild(compensationBtn);
        
        // 在反馈信息之后插入按钮
        const feedback = document.getElementById('feedback');
        feedback.parentNode.insertBefore(compensationContainer, feedback.nextSibling);
    }

    // 辅助函数：复制文本到剪贴板
    function copyToClipboard(textToCopy) {
        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = textToCopy;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand("copy");
        document.body.removeChild(tempTextArea);
        
        console.log("已复制到剪贴板:", textToCopy);
    }

    // Flag输入框回车事件
    flagInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitFlagBtn.click();
        }
    });
});
