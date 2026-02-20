var urlInput = document.querySelector('.url-input');
var downloadBtn = document.querySelector('.download-btn');
var btnText = document.querySelector('.btn-text');
var btnLoader = document.querySelector('.btn-loader');
var errorMsg = document.querySelector('.error-msg');
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
    if (valid) hideError();
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
    setLoading(true);

    var endpoint = currentFormat === 'mp3' ? '/downloadmp3' : '/downloadmp4';
    var downloadUrl = endpoint + '?URL=' + encodeURIComponent(url);

    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);

    setTimeout(function() {
        setLoading(false);
        document.body.removeChild(iframe);
    }, 5000);
}

function setLoading(loading) {
    downloadBtn.classList.toggle('loading', loading);
    btnText.hidden = loading;
    btnLoader.hidden = !loading;
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
}

function hideError() {
    errorMsg.hidden = true;
}
