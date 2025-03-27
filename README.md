# 萧楚楠的挑战--CTF Web方向题目

## 考点

4字符限制长度 RCE, 题目灵感来源

HITCON2017 babyfirst-revenge v2

但是对其进行了简化处理, 无需反弹Shell

## 特色

增加"兔娘"语音互动, 使各位更能代入萧楚楠的身份中

## WP 见 WriteUp.md

具体原理见HITCON2017 babyfirst-revenge v2的题解

## 彩蛋

在被假的Flag提交窗口骗了2次后(要写入Love/LOVE两次), 就可以触发补偿

补偿会跳转到福州·第三届海岸线动漫游戏嘉年华的BiliBili的购票入口

在URL中, 多了两个参数, RabbitGift和TheKey

Rabbit是进行Rabbit加密的base64字符串(记得进行URL解码)

TheKey 就是 Rabbit解密需要的 Key , 为IVIs0406IVIs0406

Key 中还套了一层信息 IV 为 0406, 因为IV要为8字节, 且 IVIs0406 写了两次(这里也是考虑到了密钥长度), 所以 IV 可以猜到为 04060406

0406 也是漫展时间

解密就可以得到密文 "什么这都被你发现了, 那你来找我吧, 只有第一个人有奖励哦", 找出题人获取奖励

为此, 增加了JS的混淆, 不过原本的JS文件并未删除, 还是可以通过文件名爆破访问到的, 就当做彩蛋获取的非预期解吧
