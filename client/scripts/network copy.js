//network.js

// 判断是否支持WebRTC
window.isRtcSupported = !!(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection);

// 保存用户的peerid
window.peerid = null;

// WebSocket服务器连接类
class ServerConnection {
// 构造函数，在实例化时自动连接服务器
constructor() {
this._connect();
// 在窗口关闭前、页面切换时自动断开连接
Events.on('beforeunload', e => this._disconnect());
Events.on('pagehide', e => this._disconnect());
// 在页面可见性改变时，如果页面隐藏则自动连接
document.addEventListener('visibilitychange', e => this._onVisibilityChange());
}


// 连接服务器
_connect() {
    // 清除重连定时器
    clearTimeout(this._reconnectTimer);
    // 如果已经连接或正在连接，则返回
    if (this._isConnected() || this._isConnecting()) return;

    // 拼接WebSocket服务器端点，如果有peerid则将其作为查询参数加在端点后面
    let endpoint = this._endpoint();
    const peerId = localStorage.getItem("peerId");
    if (peerId) {
        endpoint += '/?peerid=' + peerId;
    }
    const ws = new WebSocket(endpoint);

    // 设置二进制数据类型为arraybuffer
    ws.binaryType = 'arraybuffer';
    // 监听连接成功事件，在连接成功时调用_onOpen方法
    ws.onopen = e => this._onOpen(e);
    // 监听收到消息事件，在收到消息时调用_onMessage方法，并将消息数据作为参数传入
    ws.onmessage = e => this._onMessage(e.data);
    // 监听连接关闭事件，在连接关闭时调用_onDisconnect方法
    ws.onclose = e => this._onDisconnect();
    // 监听发生错误事件，在发生错误时将错误信息打印到控制台
    ws.onerror = e => console.error(e);
    // 将WebSocket实例保存到_socket属性中
    this._socket = ws;
}

// 在连接成功时调用，将连接成功的事件对象作为参数传入
_onOpen(e) {
    console.log('_onOpen');
    console.log(e);
}

// 在收到消息时调用，将消息数据作为参数传入
_onMessage(msg) {
    console.log('_onMessage');
    // 将消息数据从JSON字符串解析为JavaScript对象
    msg = JSON.parse(msg);
    console.log('WS:', msg);
    // 根据消息类型调用不同的方法或者触发不同的事件
    switch (msg.type) {
        case 'peers':
            Events.fire('peers', msg.peers);
            break;
        case 'peer-joined':
            Events.fire('peer-joined', msg.peer);
            break;
        case 'peer-left':
            Events.fire('peer-left', msg.peerId);
            break;
        case 'signal':
            Events.fire('signal', msg);
            break;
        case 'ping':
            this.send({
                type: 'pong'
            });
            break;
        case 'display-name':
            Events.fire('display-name', msg);
            break;
        default:
            console.error('WS: unkown message type', msg);
    }
}

// 向服务器发送消息
send(message) {
    // 如果未连接，则返回
    if (!this._isConnected()) return;
    // 将消息对象序列化为JSON字符串，并将其发送到服务器
    this._socket.send(JSON.stringify(message));
}

// 拼接WebSocket服务器端点
_endpoint() {
    // 根据当前页面的协议，判断出使用的是https还是http，并将其对应的WebSocket协议作为端点的协议部分
    const protocol = location.protocol.startsWith('https') ? 'wss' : 'ws';
    // 根据是否支持WebRTC，将'/webrtc'或者'/fallback'作为端点的路径部分
    const webrtc = window.isRtcSupported ? '/webrtc' : '/fallback';
    // 将端点的协议部分、主机部分、路径部分拼接成完整的端点，并将其返回
    // const url = protocol + '://' + location.host + location.pathname + 'server' + webrtc;
    const url = protocol + '://' + `sfs.yiersan.link/` + 'server' + webrtc;
    // const url = 'ws' + '://' + `localhost:3000/` + 'server' + webrtc;
    return url;
}

// 断开连接
_disconnect() {
    // 向服务器发送断开连接的消息
    this.send({
        type: 'disconnect'
    });
    // 移除连接关闭事件的监听器
    this._socket.onclose = null;
    // 关闭连接
    this._socket.close();
}

// 在连接关闭时调用
_onDisconnect() {
    console.log('WS: server disconnected');
    // 触发一个通知用户的事件，并将通知的内容作为参数传入
    Events.fire('notify-user', 'Connection lost. Retry in 5 seconds...');
    // 清除重连定时器
    clearTimeout(this._reconnectTimer);
    // 5秒钟后自动重连
    this._reconnectTimer = setTimeout(_ => this._connect(), 5000);
}

// 在页面可见性改变时调用
_onVisibilityChange() {
    // 如果页面隐藏，则返回
    if (document.hidden) return;
    // 如果页面可见，则自动连接
    this._connect();
}

// 判断是否已经连接
_isConnected() {
    // 如果_socket属性不存在或者其readyState属性不是OPEN，则返回false，否则返回true
    return this._socket && this._socket.readyState === this._socket.OPEN;
}

// 判断是否正在连接
_isConnecting() {
    // 如果_socket属性不存在或者其readyState属性不是CONNECTING，则返回false，否则返回true
    return this._socket && this._socket.readyState === this._socket.CONNECTING;
}
}

// 与一个特定的peer的连接类
class Peer {
// 构造函数，将ServerConnection实例和peerid作为参数传入，并将其保存到_server和_peerId属性中
constructor(serverConnection, peerId) {
this._server = serverConnection;
this._peerId = peerId;
// 用于保存待发送的文件队列
this._filesQueue = [];
// 用于标记是否正在发送文件
this._busy = false;
}


// 向peer发送JSON格式的消息
sendJSON(message) {
    // 将消息对象序列化为JSON字符串，并调用_send方法将其发送到peer
    this._send(JSON.stringify(message));
}

// 向peer发送一个或多个文件
sendFiles(files) {
    // 将待发送的文件添加到_filesQueue队列中
    for (let i = 0; i < files.length; i++) {
        this._filesQueue.push(files[i]);
    }
    // 如果正在发送文件，则返回
    if (this._busy) return;
    this._dequeueFile();
    // 从_filesQueue队列中取出一个文件，并调用_dequeueFile方法发送其
}

// 从_filesQueue队列中取出一个文件，并发送其
_dequeueFile() {
    // 如果_filesQueue队列为空，则返回
    if (!this._filesQueue.length) return;
    // 将_busy标记为true，表示正在发送文件
    this._busy = true;
    // 从_filesQueue队列中取出一个文件
    const file = this._filesQueue.shift();
    // 调用_sendFile方法发送该文件
    this._sendFile(file);
}

// 发送一个文件
_sendFile(file) {
    // 向peer发送一个消息，告诉其将要发送的文件的名称、MIME类型和大小
    this.sendJSON({
        type: 'header',
        name: file.name,
        mime: file.type,
        size: file.size
    });
    // 创建一个FileChunker实例，用于将文件分成多个分片并发送
    this._chunker = new FileChunker(file,
        chunk => this._send(chunk),
        offset => this._onPartitionEnd(offset));
    // 调用_chunker实例的nextPartition方法，发送第一个分片
    this._chunker.nextPartition();
}

// 在发送完一个分片后调用，向peer发送一个消息，告诉其该分片的偏移量
_onPartitionEnd(offset) {
    this.sendJSON({
        type: 'partition',
        offset: offset
    });
}

// 在收到peer发送的消息时调用
_onReceivedPartitionEnd(offset) {
    this.sendJSON({ type: 'partition-received', offset: offset });
}

_sendNextPartition() {
    if (!this._chunker || this._chunker.isFileEnd()) return;
    this._chunker.nextPartition();
}

_sendProgress(progress) {
    this.sendJSON({ type: 'progress', progress: progress });
}
_onMessage(message) {
    // 如果消息是一个Blob对象，则将其作为一个分片，并调用_onChunkReceived方法
    if (typeof message !== 'string') {
        this._onChunkReceived(message);
        return;
    }
    // 如果消息是一个JSON字符串，则将其解析为一个JavaScript对象，并根据其类型调用不同的方法
    message = JSON.parse(message);
    console.log('RTC:', message);
    switch (message.type) {
        case 'header':
            this._onFileHeader(message);
            break;
        case 'partition':
            this._onReceivedPartitionEnd(message);
            break;
        case 'partition-received':
            this._sendNextPartition();
            break;
        case 'progress':
            this._onDownloadProgress(message.progress);
            break;
        case 'transfer-complete':
            this._onTransferCompleted();
            break;
        case 'text':
            this._onTextReceived(message);
            break;
    }
}

_onFileHeader(header) {
    this._lastProgress = 0;
    this._digester = new FileDigester({
        name: header.name,
        mime: header.mime,
        size: header.size
    }, file => this._onFileReceived(file));
}

// 在收到一个分片时调用
_onChunkReceived(chunk) {
    // 如果分片的大小为0，则返回
    if (!chunk.byteLength) return;
    // 将分片添加到_digester实例中，并更新_lastProgress变量
    this._digester.unchunk(chunk);
    const progress = this._digester.progress;
    this._onDownloadProgress(progress);
    // 如果进度比_lastProgress变量增加了0.01或者更多，则向peer发送一个进度消息
    if (progress - this._lastProgress < 0.01) return;
    this._lastProgress = progress;
    this._sendProgress(progress);
}

// 在下载进度更新时调用，触发一个下载进度更新的事件
_onDownloadProgress(progress) {
    Events.fire('file-progress', {
        sender: this._peerId,
        progress: progress
    });
}

// 在下载完成时调用，触发一个下载完成的事件，并向peer发送一个下载完成的消息
_onFileReceived(proxyFile) {
    Events.fire('file-received', proxyFile);
    this.sendJSON({
        type: 'transfer-complete'
    });
}

// 在下载完成时调用，将_busy标记为false，并从_filesQueue队列中取出下一个文件发送
_onTransferCompleted() {
    this._onDownloadProgress(1);
    this._reader = null;
    this._busy = false;
    this._dequeueFile();
    Events.fire('notify-user', 'File transfer completed.');
}

// 向peer发送一条文本消息
sendText(text) {
    // 将文本消息编码为Base64字符串，并将其作为一个消息对象的属性，并调用_send方法将其发送到peer
    const unescaped = btoa(unescape(encodeURIComponent(text)));
    this.sendJSON({
        type: 'text',
        text: unescaped
    });
}

// 在收到peer发送的文本消息时调用，将其解码为普通文本，并触发一个文本消息收到的事件
_onTextReceived(message) {
    const escaped = decodeURIComponent(escape(atob(message.text)));
    Events.fire('text-received', {
        text: escaped,
        sender: this._peerId
    });
}
}

// 使用WebRTC的peer连接类，继承自Peer类
class RTCPeer extends Peer {
// 构造函数，将ServerConnection实例和peerid作为参数传入，并调用父类的构造函数
constructor(serverConnection, peerId) {
super(serverConnection, peerId);
// 如果peerid为空，则表示将要监听来自其他peer的连接请求，否则将主动向peer发起连接请求
if (!peerId) return;
// 调用_connect方法，向peer发起连接请求
this._connect(peerId, true);
}


// 向peer发起连接请求
_connect(peerId, isCaller) {
    // 如果已经有一个连接，则将其作为参数传入_openConnection方法，否则调用_openConnection方法创建一个新的连接
    if (!this._conn) this._openConnection(peerId, isCaller);
    // 如果是主动发起连接请求的一方，则调用_openChannel方法创建一个数据通道，否则监听ondatachannel事件，在收到来自对方的数据通道时调用_onChannelOpened方法
    if (isCaller) {
        this._openChannel();
    } else {
        this._conn.ondatachannel = e => this._onChannelOpened(e);
    }
}

// 创建一个WebRTC连接
_openConnection(peerId, isCaller) {
    // 将是否是主动发起连接请求的一方、peerid和RTCPeer.config作为参数传入RTCPeerConnection的构造函数，创建一个新的连接
    this._isCaller = isCaller;
    this._peerId = peerId;
    this._conn = new RTCPeerConnection(RTCPeer.config);
    // 监听收到新的候选对的事件，在收到新的候选对时调用_onIceCandidate方法
    this._conn.onicecandidate = e => this._onIceCandidate(e);
    // 监听连接状态改变的事件，在连接状态改变时调用_onConnectionStateChange方法
    this._conn.onconnectionstatechange = e => this._onConnectionStateChange(e);
    // 监听ICE连接状态改变的事件，在ICE连接状态改变时调用_onIceConnectionStateChange方法
    this._conn.oniceconnectionstatechange = e => this._onIceConnectionStateChange(e);
}

// 创建一个数据通道
_openChannel() {
    // 调用RTCDataChannel的构造函数，创建一个新的数据通道
    const channel = this._conn.createDataChannel('data-channel', {
        ordered: true,
        reliable: true
    });
    // 监听数据通道的开启事件，在数据通道开启时调用_onChannelOpened方法
    channel.onopen = e => this._onChannelOpened(e);
    // 调用_conn实例的createOffer方法，创建一个新的SDP描述，并将其作为参数传入_onDescription方法
    this._conn.createOffer().then(d => this._onDescription(d)).catch(e => this._onError(e));
}

_onDescription(description) {
    // description.sdp = description.sdp.replace('b=AS:30', 'b=AS:1638400');
    this._conn.setLocalDescription(description)
        .then(_ => this._sendSignal({ sdp: description }))
        .catch(e => this._onError(e));
}

// 在收到新的候选对时调用，将其作为一个消息对象的属性，并调用_sendSignal方法将其发送到对方
_onIceCandidate(event) {
    if (!event.candidate) return;
    this._sendSignal({
        ice: event.candidate
    });
}

// 在收到对方发送的SDP描述时调用，将其作为参数传入RTCSessionDescription的构造函数，创建一个新的SDP描述，并调用_conn实例的setRemoteDescription方法，将其设置为远程描述，并将其作为参数传入_onDescription方法
onServerMessage(message) {
    if (!this._conn) this._connect(message.sender, false);
    if (message.sdp) {
        this._conn.setRemoteDescription(new RTCSessionDescription(message.sdp))
            .then(_ => {
                if (message.sdp.type === 'offer') {
                    return this._conn.createAnswer()
                        .then(d => this._onDescription(d));
                }
            })
            .catch(e => this._onError(e));
    } else if (message.ice) {
        this._conn.addIceCandidate(new RTCIceCandidate(message.ice));
    }
}

// 在数据通道开启时调用，将其作为参数传入_onMessage方法，监听收到消息的事件
_onChannelOpened(event) {
    console.log('RTC: channel opened with', this._peerId);
    const channel = event.channel || event.target;
    channel.binaryType = 'arraybuffer';
    channel.onmessage = e => this._onMessage(e.data);
    channel.onclose = e => this._onChannelClosed();
    this._channel = channel;
}

// 在数据通道关闭时调用
_onChannelClosed() {
    console.log('RTC: channel closed', this._peerId);
    if (!this.isCaller) return;
    this._connect(this._peerId, true);
}

// 在连接状态改变时调用
_onConnectionStateChange(e) {
    console.log('RTC: state changed:', this._conn.connectionState);
    switch (this._conn.connectionState) {
        case 'disconnected':
            this._onChannelClosed();
            break;
        case 'failed':
            this._conn = null;
            this._onChannelClosed();
            break;
    }
}

// 在ICE连接状态改变时调用
_onIceConnectionStateChange() {
    switch (this._conn.iceConnectionState) {
        case 'failed':
            console.error('ICE Gathering failed');
            break;
        default:
            console.log('ICE Gathering', this._conn.iceConnectionState);
    }
}

// 在发生错误时调用，将错误信息打印到控制台
_onError(error) {
    console.error(error);
}

// 将一个消息发送到数据通道
_send(message) {
    if (!this._channel) return this.refresh();
    this._channel.send(message);
}

_sendSignal(signal) {
    signal.type = 'signal';
    signal.to = this._peerId;
    this._server.send(signal);
}

// 刷新连接
refresh() {
    if (this._isConnected() || this._isConnecting()) return;
    this._connect(this._peerId, this._isCaller);
}

// 判断数据通道是否已经开启
_isConnected() {
    return this._channel && this._channel.readyState === 'open';
}

// 判断数据通道是否正在开启
_isConnecting() {
    return this._channel && this._channel.readyState === 'connecting';
}
}

// 管理所有peer的类
class PeersManager {
// 构造函数，将ServerConnection实例作为参数传入，并将其保存到_server属性中，并监听一些事件
constructor(serverConnection) {
this.peers = {};
this._server = serverConnection;
Events.on('signal', e => this._onMessage(e.detail));
Events.on('peers', e => this._onPeers(e.detail));
Events.on('files-selected', e => this._onFilesSelected(e.detail));
Events.on('send-text', e => this._onSendText(e.detail));
Events.on('peer-left', e => this._onPeerLeft(e.detail));
}


// 在收到新的消息时调用，将其作为参数传入_onMessage方法
_onMessage(message) {
    if (!this.peers[message.sender]) {
        this.peers[message.sender] = new RTCPeer(this._server);
    }
    this.peers[message.sender].onServerMessage(message);
}

// 在收到新的peer列表时调用，将其作为参数传入_onPeers方法
_onPeers(peers) {
    peers.forEach(peer => {
        if (this.peers[peer.id]) {
            this.peers[peer.id].refresh();
            return;
        }
        if (window.isRtcSupported && peer.rtcSupported) {
            this.peers[peer.id] = new RTCPeer(this._server, peer.id);
        } else {
            this.peers[peer.id] = new WSPeer(this._server, peer.id);
        }
    })
}

// 向一个特定的peer发送一个消息
sendTo(peerId, message) {
    this.peers[peerId].send(message);
}

// 在收到新的文件列表时调用，将其作为参数传入_onFilesSelected方法
_onFilesSelected(message) {
    this.peers[message.to].sendFiles(message.files);
}

// 在收到新的文本消息时调用，将其作为参数传入_onSendText方法
_onSendText(message) {
    this.peers[message.to].sendText(message.text);
}

// 在一个peer离开时调用，将其作为参数传入_onPeerLeft方法
_onPeerLeft(peerId) {
    const peer = this.peers[peerId];
    delete this.peers[peerId];
    if (!peer || !peer._peer) return;
    peer._peer.close();
}
}

// 使用WebSocket的peer连接类
class WSPeer {
// 将一个消息发送到服务器
_send(message) {
message.to = this._peerId;
this._server.send(message);
}
}

// 将一个文件分成多个分片的类
class FileChunker {
// 构造函数，将一个文件、一个回调函数和一个分片大度作为参数传入，并将其保存到_file、_onChunk和_chunkSize属性中，并创建一个FileReader实例，用于读取文件的分片
constructor(file, onChunk, onPartitionEnd) {
this._chunkSize = 64000;
this._maxPartitionSize = 1e6;
this._offset = 0;
this._partitionSize = 0;
this._file = file;
this._onChunk = onChunk;
this._onPartitionEnd = onPartitionEnd;
this._reader = new FileReader();
this._reader.addEventListener('load', e => this._onChunkRead(e.target.result));
}


// 读取文件的下一个分片
nextPartition() {
    this._partitionSize = 0;
    this._readChunk();
}

// 读取一个分片
_readChunk() {
    const chunk = this._file.slice(this._offset, this._offset + this._chunkSize);
    this._reader.readAsArrayBuffer(chunk);
}

// 在读取完一个分片后调用，将其作为参数传入_onChunk方法，并更新_offset和_partitionSize变量，如果已经读取完整个文件或者已经读取了一个分片，则返回，否则调用_readChunk方法继续读取下一个分片
_onChunkRead(chunk) {
    this._offset += chunk.byteLength;
    this._partitionSize += chunk.byteLength;
    this._onChunk(chunk);
    if (this.isFileEnd()) return;
    if (this._isPartitionEnd()) {
        this._onPartitionEnd(this._offset);
        return;
    }
    this._readChunk();
}

// 重新读取上一个分片
repeatPartition() {
    this._offset -= this._partitionSize;
    this._nextPartition();
}

// 判断是否已经读取了一个分片
_isPartitionEnd() {
    return this._partitionSize >= this._maxPartitionSize;
}

// 判断是否已经读取完整个文件
isFileEnd() {
    return this._offset >= this._file.size;
}

// 获取当前的下载进度
get progress() {
    return this._offset / this._file.size;
}
}

// 将多个分片组合成一个完整的文件的类
class FileDigester {
// 构造函数，将一个文件的元数据和一个回调函数作为参数传入，并将其保存到_mime、_name和_callback属性中，并创建一个Blob对象，用于保存组合后的文件
constructor(meta, callback) {
this._buffer = [];
this._bytesReceived = 0;
this._size = meta.size;
this._mime = meta.mime || 'application/octet-stream';
this._name = meta.name;
this._callback = callback;
}


// 将一个分片添加到_buffer数组中，并更新_bytesReceived变量，如果已经接收到了所有的分片，则调用_callback方法，将组合后的文件作为参数传入
unchunk(chunk) {
    this._buffer.push(chunk);
    this._bytesReceived += chunk.byteLength || chunk.size;
    const totalChunks = this._buffer.length;
    this.progress = this._bytesReceived / this._size;
    if (isNaN(this.progress)) this.progress = 1
    if (this._bytesReceived < this._size) return;
    let blob = new Blob(this._buffer, {
        type: this._mime
    });
    this._callback({
        name: this._name,
        mime: this._mime,
        size: this._size,
        blob: blob
    });
}
}

// 事件管理类
class Events {
// 触发一个事件
static fire(type, detail) {
window.dispatchEvent(new CustomEvent(type, {
detail: detail
}));
}


// 监听一个事件
static on(type, callback) {
    return window.addEventListener(type, callback, false);
}

// 取消监听一个事件
static off(type, callback) {
    return window.removeEventListener(type, callback, false);
}
}

// WebRTC的配置信息
RTCPeer.config = {
'sdpSemantics': 'unified-plan',
'iceServers': [{
urls: 'stun.l.google.com:19302'
}]
}