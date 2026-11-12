# 운영 안내

## 매일 할 일

무료 편집 모드는 별도 소재 입력 없이 동작합니다. 개인화한 GPT 모드는 공개 가능한 익명 요약을 `GALLERY_CONTEXT_JSON` secret으로 공급하세요. 원문, 실명, 가족 정보, 사내 코드/기획/일정/매출, 연락처, 로그인 정보는 보내지 않습니다. secret이라고 해서 모델 출력에 내용이 반영되지 않는 것은 아닙니다.

요약에는 상황의 구조만 남기세요. 예: “사내 A팀의 B 기능 오류” 대신 “작은 변경에서 시작해 예상 밖 문제가 생긴 가상 개발 일상”. 누가 무엇을 했는지의 사실보다 협업에서 느낄 법한 우스운 상황을 각색합니다.

## 발행이 멈췄을 때

1. 저장소 Actions에서 가장 최근 실행을 확인합니다. Settings → Pages의 source가 GitHub Actions인지 확인합니다.
2. API 모드에서 401/429이면 키·결제·한도·모델 접근권을 확인합니다. 에러 로그에는 원문과 API 응답 전문을 기록하지 않습니다.
3. context 승인/만료 형식이나 개인정보 패턴이 원인이면 안전한 요약으로 수정합니다. 이미 지난 만료일은 일반 창작으로 전환되지만 승인 누락은 오류입니다.
4. “Run workflow”로 다시 실행합니다. 기존 회차 파일이 있으면 새 과금 없이 그대로 배포됩니다. API 요청 이후 파일 기록 전에 실패한 경우 재실행은 과금될 수 있습니다.
5. 운영을 멈추려면 Actions의 해당 workflow를 Disable 합니다. 무료 모드로 전환하려면 `GALLERY_GENERATION_MODE` variable을 `template`으로 바꿉니다.

## 글 수정/삭제

`content/editions/회차.json`의 해당 글을 수정하고 커밋합니다. 글이 하나도 남지 않으면 회차 파일 전체를 제거할 수 있습니다. JSON의 글 id를 변경하면 기존 공유 주소와 이 브라우저의 저장/추천 연결은 끊어집니다. 텍스트만 바꾸면 id가 유지됩니다. 생성기는 존재하는 파일을 덮어쓰지 않습니다.

원하는 과거 누락 회차를 수동 생성할 때는 로컬에서 다음처럼 설정할 수 있습니다. 미래 회차는 차단됩니다. 오래된 소재를 최신 대화처럼 표현하지 마세요.

```sh
GALLERY_SLOT=2026-11-12-09 npm run generate
npm test
npm run build
```

공개된 파일을 삭제해도 Git 이력에는 남습니다. 민감 정보가 잘못 게시되면 우선 사이트 노출을 중단하고 키를 폐기/교체한 뒤, GitHub의 민감 정보 제거 절차와 캐시/포크 사본을 별도로 처리해야 합니다. 단순 삭제를 완전한 회수로 간주하지 마세요.

## API 결과를 사람이 먼저 확인하려면

자동 공개가 부담되는 시기에는 Actions를 잠시 Disable 하고 로컬에서 생성하세요. `content/editions/` 결과를 읽고 익명성·문체를 검토한 뒤 커밋하면 push 배포는 생성 없이 검증/게시만 수행합니다. 이 프로젝트에는 서버 관리 화면/공개 댓글/실시간 승인 큐가 없습니다.

## Cloudflare Pages를 대신 쓸 때

GitHub Pages와 **하나만** 선택하세요. 공개 소스 저장소는 그대로 두고 Cloudflare에서 GitHub 저장소를 연결합니다.

1. Cloudflare → Workers & Pages → Create application → Pages → Import an existing Git repository.
2. Production branch: `main`; Framework preset: `None`; Build command: `npm run build`; Output directory: `dist`; Node.js: 22 이상.
3. `.github/workflows/gallery.yml`에서 `configure-pages`, `upload-pages-artifact`, `Publish GitHub Pages` 단계를 제거합니다. `environment: github-pages`와 `pages`/`id-token` 권한도 제거합니다. **생성·검증·콘텐츠 커밋 단계는 유지**합니다. 그렇지 않으면 기존 정적 자료만 빌드됩니다.
4. GitHub Actions 봇 커밋도 Cloudflare Git 연동에서 배포 대상이 되는지 실제 새 회차로 확인하세요. Git 연동의 봇 커밋 정책 때문에 갱신이 안 되면 아래 Direct Upload를 사용합니다.

Cloudflare Git 연동 대신 Direct Upload 방식도 가능합니다. Pages 프로젝트를 먼저 만들고 GitHub Actions에 제한된 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` secrets를 등록합니다. Pages 전용 최소 권한을 주고, 계정 전체 Global API key는 쓰지 마세요. `CLOUDFLARE_PROJECT_NAME` variable을 프로젝트명으로 등록합니다. 직접 업로드 프로젝트와 Git 연동 프로젝트의 전환 제약은 Cloudflare 공식 문서를 먼저 확인하세요.

Pages 배포 단계를 다음으로 교체합니다. 이 대안은 기본 워크플로에 활성화되어 있지 않습니다.

```yaml
- name: Publish Cloudflare Pages
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: pages deploy dist --project-name=${{ vars.CLOUDFLARE_PROJECT_NAME }} --branch=main
```

배포 artifact는 `dist/`만 사용합니다. 원본 저장소/요약 원문을 통째로 업로드하지 마세요. Cloudflare용 `_headers`를 포함하며 GitHub Pages에서는 이 파일의 헤더가 적용되지 않습니다. 양쪽 모두 기본 CSP는 HTML meta로 설정되어 있습니다.

## 변경 검증

```sh
npm test
npm run build
npm run dev
```

휴대폰/좁은 화면에서 긴 제목과 팝업을 확인하고, 검색 → 상세 → 목록 복귀, 추천 재클릭 취소, 저장 후 새로고침, 월별 필터를 확인하세요. API 테스트는 가짜 응답을 사용하므로 실제 호출·비용이 없습니다. 유료 호출은 운영자가 직접 키와 모드를 설정한 뒤에만 이루어집니다.

개인 메모와 추천을 다른 기기로 동기화하거나 전 방문자의 추천을 합산하려면 인증·데이터베이스·쓰기 방어가 있는 서버가 필요합니다. 정적 JSON에 방문자 쓰기용 GitHub 토큰을 넣는 방식은 사용하지 않습니다.
