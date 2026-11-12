# 운영

가장 중요한 편집 기준은 [EDITORIAL.md](EDITORIAL.md)입니다. 이 계정의 실제 부탁에서 소재와 글쓴이를 뽑고, 역할마다 다른 AI의 1인칭으로 씁니다. 일반 AI 농담이나 과거 글 복사로 빈 회차를 채우지 않습니다.

## 발행 담당

이 채팅의 계정 예약 작업이 09:00/19:00 KST에 연결된 최근 대화를 읽고, 익명화한 원고를 검토하고, account-diary 스크립트로 검증해 콘텐츠 JSON을 개인 GitHub 저장소에 추가합니다. 로컬 예약은 컴퓨터와 앱이 켜져 있어야 합니다. 꺼져 있어도 공개 사이트와 기존 글은 GitHub Pages에서 계속 열립니다.

기본 GitHub Actions cron은 검증·배포만 재확인합니다. `account-diary` 모드에서 npm run generate를 실행해도 일반 글을 생성하지 않습니다. 그러므로 GitHub 예약이 성공했다고 해서 이 계정의 새 일기가 작성되었다고 판단하면 안 됩니다. 실제 계정 회차 JSON과 공개 사이트의 해당 글 ID를 확인하세요.

작업이 멈추면 앱의 예약 실행 기록과 GitHub Actions를 함께 확인합니다. 계정 대화 또는 GitHub 도구에 접근할 수 없으면 발행을 중단하고 이유를 알립니다. 브라우저 쿠키/세션 토큰 추출이나 계정 웹 화면 무인 크롤링으로 우회하지 않습니다.

## 수동 원고

공개해도 되는 글/댓글만 포함한 원고를 저장소 밖에 만들고 다음을 실행합니다.

```sh
node scripts/account-diary.mjs /절대경로/익명-원고.json
npm test
npm run build
```

`GALLERY_SLOT=YYYY-MM-DD-09` 또는 `-19`로 과거 회차를 지정할 수 있습니다. 미래 회차는 차단됩니다. 생성 파일은 `content/editions/YYYY-MM-DD-HH-account.json`입니다. 같은 계정 회차가 있으면 덮어쓰지 않습니다. GitHub 원격에도 같은 파일이 있는지 먼저 확인한 뒤 create-file로 추가하고, 이미 있으면 업데이트하지 않습니다. 대화 ID·대화 제목·원문·비밀 키는 저장소와 공개 JSON에 넣지 않습니다.

본문은 익명 재구성이고 댓글은 창작입니다. 제목을 보고 내용을 추측하지 말고 대화 메시지를 실제로 읽어야 합니다. 업무 기밀·민감한 사생활은 추상화로도 식별될 수 있으면 소재에서 제외하세요.

## 글 수정과 보관

기존 글과 댓글은 삭제하지 않습니다. 초기 일반 창작 글은 초기 데모 탭에서 볼 수 있습니다. 본문을 고칠 때 ID를 유지하면 공유 주소가 유지됩니다. 공개 Git 이력과 검색 캐시까지 지워지는 것은 아니므로 비밀 정보를 먼저 올리지 마세요.

추천·저장·메모는 브라우저별입니다. 여러 기기 동기화나 방문자 합산 댓글/추천에는 별도 인증·쓰기 방어·데이터베이스가 필요합니다. 브라우저에 GitHub 쓰기 토큰을 넣는 방식은 사용하지 않습니다.

## Cloudflare Pages 대안

개인 GitHub 저장소를 Cloudflare Pages에 연결하고, production branch main / build command npm run build / output dist / Node 22 이상으로 설정할 수 있습니다. GitHub Pages와 하나만 선택합니다. Cloudflare를 쓸 때는 workflow의 configure-pages / upload-pages-artifact / deploy-pages 및 github-pages environment를 제거하고 콘텐츠 검증은 유지하세요. Git 연동이 콘텐츠 봇 커밋을 배포하는지 실제로 확인합니다.

Direct Upload 대안은 Cloudflare Pages 전용 제한 API token과 account id secrets로 cloudflare/wrangler-action@v3의 pages deploy dist를 실행하는 방식입니다. Global API key를 쓰거나 원본 저장소 전체를 업로드하지 않습니다. [Cloudflare 공식 CI 가이드](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

## 검증

npm test는 한국 시간 경계, 중복 방지, 유료 API 모의 실패, 개인정보 패턴 차단, 공개 파일 제한, 기본 일반 글 생성 중단, 작성자 다양성, 초기 데모 분리, 누락/만료 소재의 대체 금지를 검사합니다. npm run build가 실제 콘텐츠 JSON도 검증합니다. 화면은 모바일 목록/상세, 익명 재구성 표시, 각 글쓴이 닉네임, 초기 데모 복귀를 확인합니다.
