var urlInput = document.querySelector('.url-input');
var downloadBtn = document.querySelector('.download-btn');
var btnText = document.querySelector('.btn-text');
var btnLoader = document.querySelector('.btn-loader');
var progressContainer = document.querySelector('.progress-container');
var progressFill = document.querySelector('.progress-fill');
var progressText = document.querySelector('.progress-text');
var statusMsg = document.querySelector('.status-msg');
var errorMsg = document.querySelector('.error-msg');
var downloadLinkContainer = document.querySelector('.download-link-container');
var downloadLink = document.querySelector('.download-link');
var copyLinkBtn = document.querySelector('.copy-link-btn');
var formatBtns = document.querySelectorAll('.format-btn');
var currentFormat = 'mp4';

var YT_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/;

formatBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
        formatBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentFormat = btn.dataset.format;
    });
});

urlInput.addEventListener('input', function() {
    var valid = YT_REGEX.test(urlInput.value.trim());
    downloadBtn.disabled = !valid;
    if (valid) { hideError(); hideStatus(); hideProgress(); hideDownloadLink(); }
});

copyLinkBtn.addEventListener('click', function() {
    if (downloadLink.href && downloadLink.href !== '#') {
        navigator.clipboard.writeText(downloadLink.href).then(function() {
            copyLinkBtn.textContent = 'Copied!';
            setTimeout(function() { copyLinkBtn.textContent = 'Copy'; }, 2000);
        });
    }
});

urlInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !downloadBtn.disabled) {
        startDownload();
    }
});

downloadBtn.addEventListener('click', startDownload);

function startDownload() {
    var url = urlInput.value.trim();
    if (!YT_REGEX.test(url)) {
        showError('Please enter a valid YouTube URL.');
        return;
    }

    hideError();
    hideStatus();
    hideProgress();
    setLoading(true);

    if (currentFormat === 'short') {
        hideDownloadLink();
        showProgress(0);
        showStatus('Converting to Short…');
        convertToShort(url);
        return;
    }

    showStatus('Downloading…');
    var endpoint = currentFormat === 'mp3' ? '/downloadmp3' : '/downloadmp4';
    var downloadUrl = endpoint + '?URL=' + encodeURIComponent(url);

    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);

    setTimeout(function() {
        setLoading(false);
        hideStatus();
        document.body.removeChild(iframe);
    }, 5000);
}

function convertToShort(url) {
    fetch('/api/convert-to-short', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, duration: 60, stream: true })
    })
    .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error([d.error, d.hint].filter(Boolean).join(' ') || 'Conversion failed'); });
        return r.body.getReader();
    })
    .then(function(reader) {
        var decoder = new TextDecoder();
        var buffer = '';
        function pump() {
            return reader.read().then(function(_ref) {
                var done = _ref.done, value = _ref.value;
                if (done) return;
                buffer += decoder.decode(value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';
                lines.forEach(function(line) {
                    if (!line.trim()) return;
                    try {
                        var data = JSON.parse(line);
                        if (typeof data.progress === 'number') showProgress(data.progress);
                        if (data.downloadUrl) {
                            setLoading(false);
                            showProgress(100);
                            showStatus('Done! Your Short is ready.', true);
                            showDownloadLink(data.downloadUrl);
                            window.open(data.downloadUrl, '_blank');
                            setTimeout(function() { hideProgress(); hideStatus(); }, 3000);
                        }
                        if (data.error) throw new Error(data.error);
                    } catch (e) {
                        if (e instanceof SyntaxError) return;
                        throw e;
                    }
                });
                return pump();
            });
        }
        return pump();
    })
    .catch(function(err) {
        setLoading(false);
        hideProgress();
        hideStatus();
        showError(err.message || 'Conversion failed. Try again.');
    });
}

function setLoading(loading) {
    downloadBtn.classList.toggle('loading', loading);
    btnText.hidden = loading;
    btnLoader.hidden = !loading;
}

function showProgress(pct) {
    progressContainer.hidden = false;
    progressFill.style.width = pct + '%';
    progressText.textContent = pct + '%';
}

function hideProgress() {
    progressContainer.hidden = true;
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
}

function showStatus(msg, isSuccess) {
    statusMsg.textContent = msg;
    statusMsg.classList.toggle('success', !!isSuccess);
    statusMsg.hidden = false;
}

function hideStatus() {
    statusMsg.hidden = true;
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
}

function hideError() {
    errorMsg.hidden = true;
}

function showDownloadLink(url) {
    downloadLink.href = url;
    downloadLink.textContent = 'Download your Short';
    downloadLinkContainer.hidden = false;
}

function hideDownloadLink() {
    downloadLink.href = '#';
    downloadLinkContainer.hidden = true;
}
