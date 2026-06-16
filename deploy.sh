#!/bin/bash
cd /home/ubuntu/flashtalk

RESPONSE=$(cat /home/ubuntu/flashtalk/upstream.conf)

if echo "$RESPONSE" | grep -q "flashtalk-blue"; then
    TARGET_COLOR="green"
    TARGET_PORT="3002"
    OLD_COLOR="blue"
else
    TARGET_COLOR="blue"
    TARGET_PORT="3001"
    OLD_COLOR="green"
fi

echo "배포 시작: 타겟 컨테이너는 [ $TARGET_COLOR ] 입니다."

docker compose up -d flashtalk-$TARGET_COLOR

echo "신규 [ $TARGET_COLOR ] 서버 부팅 상태 및 헬스 체크를 시작합니다..."
for i in {1..10}; do
    
    HEALTH=$(docker compose exec -T nginx curl -s -o /dev/null -w "%{http_code}" http://flashtalk-$TARGET_COLOR:3000/)

    if [ "$HEALTH" != "fail" ]; then
        echo "헬스 체크 성공. 새 서버가 준비되었습니다."
        break
    fi
    echo "아직 준비되지 않았습니다. 5초 후 재시도합니다... ($i/10)"
    sleep 5
done

echo "Nginx 라우팅 타겟을 [ flashtalk-$TARGET_COLOR ] 로 스위칭합니다."
echo "upstream flashtalk-router { server flashtalk-$TARGET_COLOR:$TARGET_PORT; }" > /home/ubuntu/flashtalk/upstream.conf

docker compose exec -T nginx nginx -s reload

echo " 구버전 [ flashtalk-$OLD_COLOR ] 컨테이너를 종료합니다."
docker compose stop flashtalk-$OLD_COLOR