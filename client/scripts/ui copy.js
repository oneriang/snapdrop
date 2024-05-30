//ui.js

const $ = query => document.getElementById(query);
const $$ = query => document.body.querySelector(query);
const isURL = text => /^((https?:\/\/|www)[^\s]+)/g.test(text.toLowerCase());
window.isDownloadSupported = (typeof document.createElement('a').download !== 'undefined');
window.isProductionEnvironment = !window.location.host.startsWith('localhost');
window.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

const $log = $('log');

// set display name
Events.on('display-name',  e => {
    //alert('display-name');
    console.log('display-name');
    console.log(e);
    const me = e.detail.message;
    const $displayName = $('displayName')

    window.peerid = me.peerId;
    localStorage.setItem("peerId", me.peerId);
//alert(me.peerId);
/*
        // 更新操作
        let userId = 1;
         crudOperation('Users', 'update', {
            userId: userId,
            peerId: me.peerId,
            updatedAt: new Date()
        });

        let user =  crudOperation('Users', 'read', null, userId);
        console.log('User retrieved:', user);
        $log.textContent = JSON.stringify(user);
      
*/
    //$displayName.textContent = 'You are known as ' + me.displayName;
    $displayName.textContent = 'You are known as ' + me.peerId;
    
    $displayName.title = me.deviceName;
});

class PeersUI {

    constructor() {
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('peer-left', e => this._onPeerLeft(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('file-progress', e => this._onFileProgress(e.detail));
        Events.on('paste', e => this._onPaste(e));
    }

    async _onPeerJoined(peer) {
        console.log("_onPeerJoined");

        console.log(peer.id);
        
        // 读取操作
        let user = await crudOperation('Users', 'read', null, userId);
        
        let userId = await crudOperation('Users', 'create', {
                peerId: peer.id,
                username: 'john_doe',
                displayName: 'John Doe',
                email: 'john@example.com',
                password: 'hashed_password',
                avatarUrl: '',
                status: 'online',
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
        alert(userId);
        
        if ($(peer.id)) return; // peer already exists
       
        const peerUI = new PeerUI(peer);
        $$('x-peers').appendChild(peerUI.$el);
        // setTimeout(e => window.animateBackground(false), 1750); // Stop animation
    }

    _onPeers(peers) {
        this._clearPeers();
        peers.forEach(peer => this._onPeerJoined(peer));
    }

    _onPeerLeft(peerId) {
        const $peer = $(peerId);
        if (!$peer) return;
        $peer.remove();
    }

    _onFileProgress(progress) {
        const peerId = progress.sender || progress.recipient;
        const $peer = $(peerId);
        if (!$peer) return;
        $peer.ui.setProgress(progress.progress);
    }

    _clearPeers() {
        const $peers = $$('x-peers').innerHTML = '';
    }

    _onPaste(e) {
        const files = e.clipboardData.files || e.clipboardData.items
            .filter(i => i.type.indexOf('image') > -1)
            .map(i => i.getAsFile());
        const peers = document.querySelectorAll('x-peer');
        // send the pasted image content to the only peer if there is one
        // otherwise, select the peer somehow by notifying the client that
        // "image data has been pasted, click the client to which to send it"
        // not implemented
        if (files.length > 0 && peers.length === 1) {
            Events.fire('files-selected', {
                files: files,
                to: $$('x-peer').id
            });
        }
    }
}

class PeerUI {

    html() {
        return `
            <label class="column center" title="Click to send files or right click to send a text">
                <!-- <input type="file" multiple> -->
                <x-icon shadow="1">
                    <svg class="icon"><use xlink:href="#"/></svg>
                </x-icon>
                <div class="progress">
                  <div class="circle"></div>
                  <div class="circle right"></div>
                </div>
                <div class="name font-subheading"></div>
                <div class="device-name font-body2"></div>
                <div class="status font-body2"></div>
                <div id="recorder-time">00:00</div>
                <div>
                    <button id="start-btn-none" style="display:none" >Start Recording</button>
                    <button id="start-btn" style="display:none" >Start Recording</button>
                    <button id="stop-btn" style="display:none" >Stop Recording</button>
                    <audio id="player" controls style="display:none" ></audio>
                    <input type="file" multiple style="display:none;">
                    <ul id="voice-list"></ul>
                </div>
            </label>`
    }

    constructor(peer) {
        this._peer = peer;
        this._initDom();
        this._bindListeners(this.$el);
    }

    _initDom() {
        const el = document.createElement('x-peer');
        el.id = this._peer.id;
        el.innerHTML = this.html();
        el.ui = this;
        el.querySelector('svg use').setAttribute('xlink:href', this._icon());
        el.querySelector('.name').textContent = this._displayName();
        el.querySelector('.device-name').textContent = this._deviceName();
        this.$el = el;
        this.$progress = el.querySelector('.progress');

        console.log(1);
        const startBtn = el.querySelector('#start-btn');
        const stopBtn = el.querySelector('#stop-btn');
        const player = el.querySelector('#player');
        const voiceList = el.querySelector('#voice-list');
        let mediaRecorder;
        let recordedChunks = [];

        const recorderTime = el.querySelector('#recorder-time');
        
        let startTime;
    
        startBtn.addEventListener('click', () => {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                if (!mediaRecorder) {
                    mediaRecorder = new MediaRecorder(stream);
                }
                
                if (mediaRecorder.state == "recording")
                {
                    mediaRecorder.addEventListener('stop', () => {
                        const recordedBlob = new Blob(recordedChunks, { type: 'audio/mp3' });
                        recordedChunks = [];
                        //player.src = URL.createObjectURL(recordedBlob);
                        
                        const timestamp = new Date().toISOString();
                        addVoiceToList(recordedBlob, timestamp);

                        // 将录音文件发送给对方
                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.style.display = 'none';
        
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(new File([recordedBlob], 'recorded-audio.mp3', { type: 'audio/mp3' }));
                        fileInput.files = dataTransfer.files;
        
                        Events.fire('files-selected', {
                            files: fileInput.files,
                            to: this._peer.id
                        });
                        fileInput.value = null; // reset input

                        mediaRecorder = null;
                    });

                    mediaRecorder.stop();
                    // startBtn.disabled = false;
                    // stopBtn.disabled = true;

                    updateRecorderTime();
                 
                    el.querySelector('x-icon').classList.remove('recording');
                }
                else
                {
                    mediaRecorder.start();
                    // startBtn.disabled = true;
                    // stopBtn.disabled = false;

                    el.querySelector('x-icon').classList.add('recording');

                                
                    startTime = Date.now();
                    updateRecorderTime();

                    mediaRecorder.addEventListener('dataavailable', event => {
                        recordedChunks.push(event.data);
                    });
                }

            })
            .catch(error => {
                alert(error)
            console.error('Error accessing media devices.', error);
            });
        });
    
        // Events.on('file-received', e => {
        //     console.log("file-received");
        //     console.log(e.detail);

        //     const timestamp = new Date().toISOString();
        //     addVoiceToList(e.detail.blob, timestamp);
        // });

        function addVoiceToList(voiceBlob, name) {
            const voiceUrl = URL.createObjectURL(voiceBlob);
            const voiceLi = document.createElement('li');
            const voiceAudio = document.createElement('audio');
            const voiceDelete = document.createElement('button');
            voiceAudio.src = voiceUrl;
            voiceAudio.controls = true;
            voiceDelete.textContent = 'Delete';
            voiceDelete.addEventListener('click', () => {
              voiceList.removeChild(voiceLi);
              URL.revokeObjectURL(voiceUrl);
              deleteAudioFile(name);
            });
            voiceLi.appendChild(voiceAudio);
            voiceLi.appendChild(voiceDelete);
            voiceList.appendChild(voiceLi);
          }

        function updateRecorderTime() {

            if (mediaRecorder.state == "recording"){
                const currentTime = Date.now();
                const elapsedTime = currentTime - startTime;
                const minutes = Math.floor(elapsedTime / 60000);
                const seconds = Math.floor((elapsedTime % 60000) / 1000);
                recorderTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                requestAnimationFrame(updateRecorderTime);
            }
            
          }

        console.log(4)
        
        // stopBtn.addEventListener('click', () => {
        //     mediaRecorder.stop();
        //     // startBtn.disabled = false;
        //     // stopBtn.disabled = true;
            
        //     mediaRecorder.addEventListener('stop', () => {
        //         const recordedBlob = new Blob(recordedChunks, { type: 'audio/mp3' });
        //         recordedChunks = [];
        //         //player.src = URL.createObjectURL(recordedBlob);
                
        //         // 将录音文件发送给对方
        //         const fileInput = document.createElement('input');
        //         fileInput.type = 'file';
        //         fileInput.style.display = 'none';

        //         const dataTransfer = new DataTransfer();
        //         dataTransfer.items.add(new File([recordedBlob], 'recorded-audio.mp3', { type: 'audio/mp3' }));
        //         fileInput.files = dataTransfer.files;

        //         Events.fire('files-selected', {
        //             files: fileInput.files,
        //             to: this._peer.id
        //         });
        //         fileInput.value = null; // reset input
        //     });
        // });

        // el.addEventListener('click', (e) => {
        //     e.preventDefault();
        //     startBtn.click();
        // });

    }

    _bindListeners(el) {
        //el.querySelector('input').addEventListener('change', e => this._onFilesSelected(e));
        el.addEventListener('click', e => this._onClick(e));
        el.addEventListener('drop', e => this._onDrop(e));
        el.addEventListener('dragend', e => this._onDragEnd(e));
        el.addEventListener('dragleave', e => this._onDragEnd(e));
        el.addEventListener('dragover', e => this._onDragOver(e));
        el.addEventListener('contextmenu', e => this._onRightClick(e));
        el.addEventListener('touchstart', e => this._onTouchStart(e));
        el.addEventListener('touchend', e => this._onTouchEnd(e));
        // prevent browser's default file drop behavior
        Events.on('dragover', e => e.preventDefault());
        Events.on('drop', e => e.preventDefault());
    }

    _displayName() {
        return this._peer.name.displayName;
    }

    _deviceName() {
        return this._peer.name.deviceName;
    }

    _icon() {
        const device = this._peer.name.device || this._peer.name;
        if (device.type === 'mobile') {
            return '#phone-iphone';
        }
        if (device.type === 'tablet') {
            return '#tablet-mac';
        }
        return '#desktop-mac';
    }

    _onFilesSelected(e) {
        const $input = e.target;
        const files = $input.files;
        Events.fire('files-selected', {
            files: files,
            to: this._peer.id
        });
        $input.value = null; // reset input
    }

    setProgress(progress) {
        if (progress > 0) {
            this.$el.setAttribute('transfer', '1');
        }
        if (progress > 0.5) {
            this.$progress.classList.add('over50');
        } else {
            this.$progress.classList.remove('over50');
        }
        const degrees = `rotate(${360 * progress}deg)`;
        this.$progress.style.setProperty('--progress', degrees);
        if (progress >= 1) {
            this.setProgress(0);
            this.$el.removeAttribute('transfer');
        }
    }

    _onClick(e) {
        e.preventDefault();
        Events.fire('chat-recipient', this._peer.id);
    }

    _onDrop(e) {
        e.preventDefault();
        const files = e.dataTransfer.files;
        Events.fire('files-selected', {
            files: files,
            to: this._peer.id
        });
        this._onDragEnd();
    }

    _onDragOver() {
        this.$el.setAttribute('drop', 1);
    }

    _onDragEnd() {
        this.$el.removeAttribute('drop');
    }

    _onRightClick(e) {
        e.preventDefault();
        Events.fire('text-recipient', this._peer.id);
        //this._inputClick();
    }

    _onTouchStart(e) {
        this._touchStart = Date.now();
        this._touchTimer = setTimeout(_ => this._onTouchEnd(), 610);
    }

    _onTouchEnd(e) {
        if (Date.now() - this._touchStart < 500) {
            clearTimeout(this._touchTimer);
            el.querySelector('#start-btn').click();
        } else { // this was a long tap
            if (e) e.preventDefault();
            //alert(1)
            Events.fire('text-recipient', this._peer.id);
            //this._inputClick();
        }
    }
    
    _inputClick() {
        this.$el.querySelector('input').click();
    }
}


class Dialog {
    constructor(id) {
        this.$el = $(id);
        this.$el.querySelectorAll('[close]').forEach(el => el.addEventListener('click', e => this.hide()))
        this.$autoFocus = this.$el.querySelector('[autofocus]');
    }

    _onRecipient(recipient) {
        this._recipient = recipient;
        this.show();
    }

    show() {
        this.$el.setAttribute('show', 1);
        if (this.$autoFocus) this.$autoFocus.focus();
    }

    hide() {
        this.$el.removeAttribute('show');
        document.activeElement.blur();
        window.blur();
    }
}

class ChatDialog extends Dialog {

    constructor() {
        super('chatDialog');
        Events.on('chat-recipient', e => this._onRecipient(e.detail));
        Events.on('text-received', e => this._onText(e.detail))
        this.$senderId = this.$el.querySelector('#senderId');
        this.$chatList = this.$el.querySelector('#chatList');
        this.$chatText = this.$el.querySelector('#chatTextInput');
        const button = this.$el.querySelector('#chatTextSendButton');
        button.addEventListener('click', e => this._send(e));
    }


    _onRecipient(recipient) {
        if (this._recipient != recipient) {
            this._recipient = recipient;
            this.$senderId.innerText = this._recipient;
            this.show();                
        }
    }

    hide() {
        super.hide();
    }

    _send(e) {
        e.preventDefault();
        if (this.$chatText.innerText == '') {
            return;
        }
        Events.fire('send-text', {
            to: this._recipient,
            text: this.$chatText.innerText
        });
        let chatMessage = `
            <p style="text-align: right; margin-top: 4px; margin-bottom: 4px;">${this.$chatText.innerText}</p>
        `;
        // chatMessage += `
        //     <span class="time-right">${new Date().toISOString()}</span>
        // `;
        const element = document.createElement("div");
        element.className = 'textareaChat darker'; 
        element.innerHTML = chatMessage;
        this.$chatList.appendChild(element);
        this.$chatText.innerText = '';
    }

    _onText(e) {
        console.log("_onText");
        console.log(e);

        Events.fire('chat-recipient', e.sender);
        let chatMessage = '';
        const text = e.text;
        if (isURL(text)) {
            chatMessage = `
                <p style="text-align: left; margin-top: 4px; margin-bottom: 4px;">
                    <a href="${text}" target="_blank">${text}</a>
                </p>
            `;
        } else {
            chatMessage = `
                <p style="text-align: left; margin-top: 4px; margin-bottom: 4px;">${text}</p>
            `;
        }
        // chatMessage += `
        //     <span class="time-left">${new Date().toISOString()}</span>
        // `;
        const element = document.createElement("div");
        element.className = 'textareaChat'; 
        element.innerHTML = chatMessage;
        this.$chatList.appendChild(element);

        super.show();
    }
}

class ReceiveDialog extends Dialog {

    constructor() {
        super('receiveDialog');
        
        Events.on('file-received', e => {
            this._nextFile(e.detail);
            window.blop.play();
        });
        
        this._filesQueue = [];
    }

    _nextFile(nextFile) {
        if (nextFile) this._filesQueue.push(nextFile);
        if (this._busy) return;
        this._busy = true;
        const file = this._filesQueue.shift();
        this._displayFile(file);
    }

    _dequeueFile() {
        if (!this._filesQueue.length) { // nothing to do
            this._busy = false;
            return;
        }
        // dequeue next file
        setTimeout(_ => {
            this._busy = false;
            this._nextFile();
        }, 300);
    }

    _displayFile(file) {
        console.log('_displayFile');
        console.log(file);

        player.src = URL.createObjectURL(file.blob);

        const $a = this.$el.querySelector('#download');
        const url = URL.createObjectURL(file.blob);
        $a.href = url;
        $a.download = file.name;

        if(this._autoDownload()){
            $a.click()
            return
        }
        if(file.mime.split('/')[0] === 'image'){
            console.log('the file is image');
            this.$el.querySelector('.preview').style.visibility = 'inherit';
            this.$el.querySelector("#img-preview").src = url;
        }

        this.$el.querySelector('#fileName').textContent = file.name;
        this.$el.querySelector('#fileSize').textContent = this._formatFileSize(file.size);
        this.show();

        if (window.isDownloadSupported) return;
        // fallback for iOS
        $a.target = '_blank';
        const reader = new FileReader();
        reader.onload = e => $a.href = reader.result;
        reader.readAsDataURL(file.blob);
    }

    _displayFile2(file) {
        console.log('_displayFile');
        console.log(file);

        player.src = URL.createObjectURL(file.blob);

        const $a = this.$el.querySelector('#download');
        const url = URL.createObjectURL(file.blob);
        $a.href = url;
        $a.download = file.name;

        if(this._autoDownload()){
            $a.click()
            return
        }
        if(file.mime.split('/')[0] === 'image'){
            console.log('the file is image');
            this.$el.querySelector('.preview').style.visibility = 'inherit';
            this.$el.querySelector("#img-preview").src = url;
        }

        this.$el.querySelector('#fileName').textContent = file.name;
        this.$el.querySelector('#fileSize').textContent = this._formatFileSize(file.size);
        this.show();

        if (window.isDownloadSupported) return;
        // fallback for iOS
        $a.target = '_blank';
        const reader = new FileReader();
        reader.onload = e => $a.href = reader.result;
        reader.readAsDataURL(file.blob);
    }

    _formatFileSize(bytes) {
        if (bytes >= 1e9) {
            return (Math.round(bytes / 1e8) / 10) + ' GB';
        } else if (bytes >= 1e6) {
            return (Math.round(bytes / 1e5) / 10) + ' MB';
        } else if (bytes > 1000) {
            return Math.round(bytes / 1000) + ' KB';
        } else {
            return bytes + ' Bytes';
        }
    }

    hide() {
        this.$el.querySelector('.preview').style.visibility = 'hidden';
        this.$el.querySelector("#img-preview").src = "";
        super.hide();
        this._dequeueFile();
    }


    _autoDownload(){
        return !this.$el.querySelector('#autoDownload').checked
    }
}


class SendTextDialog extends Dialog {
    constructor() {
        super('sendTextDialog');
        Events.on('text-recipient', e => this._onRecipient(e.detail))
        this.$text = this.$el.querySelector('#textInput');
        const button = this.$el.querySelector('form');
        button.addEventListener('submit', e => this._send(e));
    }

    _onRecipient(recipient) {
        this._recipient = recipient;
        this._handleShareTargetText();
        this.show();

        const range = document.createRange();
        const sel = window.getSelection();

        range.selectNodeContents(this.$text);
        sel.removeAllRanges();
        sel.addRange(range);

    }

    _handleShareTargetText() {
        if (!window.shareTargetText) return;
        this.$text.textContent = window.shareTargetText;
        window.shareTargetText = '';
    }

    _send(e) {
        e.preventDefault();
        Events.fire('send-text', {
            to: this._recipient,
            text: this.$text.innerText
        });
    }
}

class ReceiveTextDialog extends Dialog {
    constructor() {
        super('receiveTextDialog');
        //Events.on('text-received', e => this._onText(e.detail))
        this.$text = this.$el.querySelector('#text');
        const $copy = this.$el.querySelector('#copy');
        copy.addEventListener('click', _ => this._onCopy());
    }

    _onText(e) {
        this.$text.innerHTML = '';
        const text = e.text;
        if (isURL(text)) {
            const $a = document.createElement('a');
            $a.href = text;
            $a.target = '_blank';
            $a.textContent = text;
            this.$text.appendChild($a);
        } else {
            this.$text.textContent = text;
        }
        this.show();
        window.blop.play();
    }

    async _onCopy() {
        await navigator.clipboard.writeText(this.$text.textContent);
        Events.fire('notify-user', 'Copied to clipboard');
    }
}

class Toast extends Dialog {
    constructor() {
        super('toast');
        Events.on('notify-user', e => this._onNotfiy(e.detail));
    }

    _onNotfiy(message) {
        this.$el.textContent = message;
        this.show();
        setTimeout(_ => this.hide(), 3000);
    }
}


class Notifications {

    constructor() {
        // Check if the browser supports notifications
        if (!('Notification' in window)) return;

        // Check whether notification permissions have already been granted
        if (Notification.permission !== 'granted') {
            this.$button = $('notification');
            this.$button.removeAttribute('hidden');
            this.$button.addEventListener('click', e => this._requestPermission());
        }
        Events.on('text-received', e => this._messageNotification(e.detail.text));
        Events.on('file-received', e => this._downloadNotification(e.detail.name));
    }

    _requestPermission() {
        Notification.requestPermission(permission => {
            if (permission !== 'granted') {
                Events.fire('notify-user', Notifications.PERMISSION_ERROR || 'Error');
                return;
            }
            this._notify('Even more snappy sharing!');
            this.$button.setAttribute('hidden', 1);
        });
    }

    _notify(message, body) {
        const config = {
            body: body,
            icon: '/images/logo_transparent_128x128.png',
        }
        let notification;
        try {
            notification = new Notification(message, config);
        } catch (e) {
            // Android doesn't support "new Notification" if service worker is installed
            if (!serviceWorker || !serviceWorker.showNotification) return;
            notification = serviceWorker.showNotification(message, config);
        }

        // Notification is persistent on Android. We have to close it manually
        const visibilitychangeHandler = () => {                             
            if (document.visibilityState === 'visible') {    
                notification.close();
                Events.off('visibilitychange', visibilitychangeHandler);
            }                                                       
        };                                                                                
        Events.on('visibilitychange', visibilitychangeHandler);

        return notification;
    }

    _messageNotification(message) {
        if (document.visibilityState !== 'visible') {
            if (isURL(message)) {
                const notification = this._notify(message, 'Click to open link');
                this._bind(notification, e => window.open(message, '_blank', null, true));
            } else {
                const notification = this._notify(message, 'Click to copy text');
                this._bind(notification, e => this._copyText(message, notification));
            }
        }
    }

    _downloadNotification(message) {
        if (document.visibilityState !== 'visible') {
            const notification = this._notify(message, 'Click to download');
            if (!window.isDownloadSupported) return;
            this._bind(notification, e => this._download(notification));
        }
    }

    _download(notification) {
        document.querySelector('x-dialog [download]').click();
        notification.close();
    }

    _copyText(message, notification) {
        notification.close();
        if (!navigator.clipboard.writeText(message)) return;
        this._notify('Copied text to clipboard');
    }

    _bind(notification, handler) {
        if (notification.then) {
            notification.then(e => serviceWorker.getNotifications().then(notifications => {
                serviceWorker.addEventListener('notificationclick', handler);
            }));
        } else {
            notification.onclick = handler;
        }
    }
}


class NetworkStatusUI {

    constructor() {
        window.addEventListener('offline', e => this._showOfflineMessage(), false);
        window.addEventListener('online', e => this._showOnlineMessage(), false);
        if (!navigator.onLine) this._showOfflineMessage();
    }

    _showOfflineMessage() {
        Events.fire('notify-user', 'You are offline');
    }

    _showOnlineMessage() {
        Events.fire('notify-user', 'You are back online');
    }
}

class WebShareTargetUI {
    constructor() {
        const parsedUrl = new URL(window.location);
        const title = parsedUrl.searchParams.get('title');
        const text = parsedUrl.searchParams.get('text');
        const url = parsedUrl.searchParams.get('url');

        let shareTargetText = title ? title : '';
        shareTargetText += text ? shareTargetText ? ' ' + text : text : '';

        if(url) shareTargetText = url; // We share only the Link - no text. Because link-only text becomes clickable.

        if (!shareTargetText) return;
        window.shareTargetText = shareTargetText;
        history.pushState({}, 'URL Rewrite', '/');
        console.log('Shared Target Text:', '"' + shareTargetText + '"');
    }
}


class Snapdrop {
    constructor() {
        const server = new ServerConnection();
        const peers = new PeersManager(server);
        const peersUI = new PeersUI();
        Events.on('load', e => {
            const chatDialog = new ChatDialog();
            const receiveDialog = new ReceiveDialog();
            const sendTextDialog = new SendTextDialog();
            const receiveTextDialog = new ReceiveTextDialog();
            const toast = new Toast();
            const notifications = new Notifications();
            const networkStatusUI = new NetworkStatusUI();
            const webShareTargetUI = new WebShareTargetUI();
        });
    }
}

const snapdrop = new Snapdrop();



if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(serviceWorker => {
            console.log('Service Worker registered');
            window.serviceWorker = serviceWorker
        });
}

window.addEventListener('beforeinstallprompt', e => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        // don't display install banner when installed
        return e.preventDefault();
    } else {
        const btn = document.querySelector('#install')
        btn.hidden = false;
        btn.onclick = _ => e.prompt();
        return e.preventDefault();
    }
});

/*
// Background Animation
Events.on('load', () => {
    let c = document.createElement('canvas');
    document.body.appendChild(c);
    let style = c.style;
    style.width = '100%';
    style.position = 'absolute';
    style.zIndex = -1;
    style.top = 0;
    style.left = 0;
    let ctx = c.getContext('2d');
    let x0, y0, w, h, dw;

    function init() {
        w = window.innerWidth;
        h = window.innerHeight;
        c.width = w;
        c.height = h;
        let offset = h > 380 ? 100 : 65;
        offset = h > 800 ? 116 : offset;
        x0 = w / 2;
        y0 = h - offset;
        dw = Math.max(w, h, 1000) / 13;
        drawCircles();
    }
    window.onresize = init;

    function drawCircle(radius) {
        ctx.beginPath();
        let color = Math.round(255 * (1 - radius / Math.max(w, h)));
        ctx.strokeStyle = 'rgba(' + color + ',' + color + ',' + color + ',0.1)';
        ctx.arc(x0, y0, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.lineWidth = 2;
    }

    let step = 0;

    function drawCircles() {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) {
            drawCircle(dw * i + step % dw);
        }
        step += 1;
    }

    let loading = true;

    function animate() {
        if (loading || step % dw < dw - 5) {
            requestAnimationFrame(function() {
                drawCircles();
                animate();
            });
        }
    }
    window.animateBackground = function(l) {
        loading = l;
        animate();
    };
    init();
    animate();
});
*/

Notifications.PERMISSION_ERROR = `
Notifications permission has been blocked
as the user has dismissed the permission prompt several times.
This can be reset in Page Info
which can be accessed by clicking the lock icon next to the URL.`;

document.body.onclick = e => { // safari hack to fix audio
    document.body.onclick = null;
    if (!(/.*Version.*Safari.*/.test(navigator.userAgent))) return;
    blop.play();
}

//####################################

function initDB() {
    return new Promise((resolve, reject) => {
        let request = indexedDB.open('chatAppDB', 1);

        request.onupgradeneeded = function(event) {
            let db = event.target.result;

            if (!db.objectStoreNames.contains('Users')) {
                let userStore = db.createObjectStore('Users', { keyPath: 'userId', autoIncrement: true });
                userStore.createIndex('username', 'username', { unique: true });
                userStore.createIndex('email', 'email', { unique: true });
            }

            if (!db.objectStoreNames.contains('Contacts')) {
                let contactStore = db.createObjectStore('Contacts', { keyPath: 'contactId', autoIncrement: true });
                contactStore.createIndex('userId', 'userId');
                contactStore.createIndex('contactUserId', 'contactUserId');
            }

            if (!db.objectStoreNames.contains('ChatSessions')) {
                let sessionStore = db.createObjectStore('ChatSessions', { keyPath: 'sessionId', autoIncrement: true });
                sessionStore.createIndex('sessionType', 'sessionType');
            }

            if (!db.objectStoreNames.contains('Messages')) {
                let messageStore = db.createObjectStore('Messages', { keyPath: 'messageId', autoIncrement: true });
                messageStore.createIndex('sessionId', 'sessionId');
                messageStore.createIndex('senderId', 'senderId');
                messageStore.createIndex('timestamp', 'timestamp');
            }

            if (!db.objectStoreNames.contains('CallRecords')) {
                let callStore = db.createObjectStore('CallRecords', { keyPath: 'callId', autoIncrement: true });
                callStore.createIndex('callerId', 'callerId');
                callStore.createIndex('receiverId', 'receiverId');
                callStore.createIndex('startTime', 'startTime');
            }
        };

        request.onsuccess = function(event) {
            console.log('Database initialized successfully');
            resolve();
        };

        request.onerror = function(event) {
            console.error('Database initialization failed', event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

function crudOperation(storeName, operation, data, key) {
    return new Promise((resolve, reject) => {
        let request = indexedDB.open('chatAppDB', 1);

        request.onsuccess = function(event) {
            let db = event.target.result;
            let transaction = db.transaction([storeName], 'readwrite');
            let store = transaction.objectStore(storeName);

            let dbRequest;
            switch (operation) {
                case 'create':
                    dbRequest = store.add(data);
                    break;
                case 'read':
                    dbRequest = store.get(key);
                    break;
                case 'update':
                    dbRequest = store.put(data);
                    break;
                case 'delete':
                    dbRequest = store.delete(key);
                    break;
                default:
                    console.error('Invalid operation');
                    reject('Invalid operation');
                    return;
            }

            dbRequest.onsuccess = function() {
                console.log(`${operation} operation successful on ${storeName}`);
                resolve(dbRequest.result);
            };

            dbRequest.onerror = function(event) {
                console.error(`Error during ${operation} operation on ${storeName}`, event.target.errorCode);
                reject(event.target.errorCode);
            };
        };

        request.onerror = function(event) {
            console.error('Database error', event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

// 调用示例
async function exampleUsage() {
    try {
        await initDB();
        
        // 创建操作
        let userId = 1;
        
        // 读取操作
        let user = await crudOperation('Users', 'read', null, userId);
        
        if (!user) {
            
            userId = await crudOperation('Users', 'create', {
                username: 'john_doe',
                displayName: 'John Doe',
                email: 'john@example.com',
                password: 'hashed_password',
                avatarUrl: '',
                status: 'online',
                createdAt: new Date(),
                updatedAt: new Date()
            });
        
            console.log('User created with ID:', userId);
                
            
        }
        
        user = await crudOperation('Users', 'read', null, userId);
        
        
        console.log('User retrieved:', user);
        
            $log.textContent = JSON.stringify(user);
       
/*
        // 更新操作
        await crudOperation('Users', 'update', {
            userId: userId,
            username: 'john_doe',
            displayName: 'Johnathan Doe',
            email: 'john@example.com',
            password: 'hashed_password',
            avatarUrl: '',
            status: 'busy',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('User updated');
*/
        // 删除操作
        //await crudOperation('Users', 'delete', null, userId);
        //console.log('User deleted');
    } catch (error) {
        console.error('Error during example usage:', error);
    }
}

initDB();

// 调用示例函数
//exampleUsage();