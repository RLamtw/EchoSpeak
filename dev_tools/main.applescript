set shellResult to do shell script "
IS_CORRECT=0
if curl -s --connect-timeout 1 http://localhost:8000/index.html | grep -q 'EchoSpeak' ; then
    IS_CORRECT=1
fi

if [ $IS_CORRECT -eq 0 ]; then
    kill -9 $(/usr/sbin/lsof -t -i:8000) 2>/dev/null || true
    if [ -d '/Volumes/Photos/AI Studio/智能朗讀器' ]; then
        cd '/Volumes/Photos/AI Studio/智能朗讀器'
        /usr/bin/python3 -m http.server 8000 >/dev/null 2>&1 &
        for i in {1..20}; do
            if curl -s --connect-timeout 1 http://localhost:8000/index.html | grep -q 'EchoSpeak' ; then
                break
            fi
            sleep 0.2
        done
        echo 'SUCCESS'
    else
        echo 'DIRECTORY_NOT_FOUND'
    fi
else
    echo 'ALREADY_RUNNING'
fi
"

if shellResult is "DIRECTORY_NOT_FOUND" then
    display dialog "找不到智能朗讀器的程式目錄！\n\n請確認您的網路硬碟（NAS / Photos）已成功掛載，且路徑正確：" & return & "\"/Volumes/Photos/AI Studio/智能朗讀器\"" with title "EchoSpeak 啟動失敗" buttons {"確定"} default button "確定" with icon stop
else
    try
        do shell script "open -a 'Microsoft Edge' --args --app='http://localhost:8000/index.html'"
    on error
        do shell script "open 'http://localhost:8000/index.html'"
    end try
end if
