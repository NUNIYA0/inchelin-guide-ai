# Inchelin Guide AI 이전 패키지

이 폴더는 다른 PC에서 Inchelin Guide AI 작업을 이어가기 위한 소스 패키지입니다.

## 가장 쉬운 방법

1. ZIP 파일을 다른 PC로 옮긴 뒤 압축을 풉니다.
2. 다른 PC에서 Codex 데스크톱 앱에 같은 계정으로 로그인합니다.
3. 압축을 푼 폴더를 프로젝트로 엽니다.
4. 새 채팅에서 `이 Inchelin Guide AI 프로젝트를 이어서 수정하고 기존 사이트에 배포해줘`라고 요청합니다.

기존 Sites 프로젝트 정보는 `.openai/hosting.json`에 포함되어 있으므로 새 사이트를 만들지 말고 기존 프로젝트를 이어서 사용해야 합니다.

## 보안

- 실제 API 키가 들어 있는 `.env.local`은 보안을 위해 이 패키지에 포함하지 않았습니다.
- 로컬 실행에 인증정보가 필요하면 `.env.example`을 참고해 새 `.env.local`을 만들고 본인의 키를 직접 입력합니다.
- API 키를 채팅이나 문서에 평문으로 붙여 넣지 마세요.

## 확인 명령

Node.js가 설치되어 있다면 아래 명령으로 빌드와 정책 테스트를 확인할 수 있습니다.

```powershell
node scripts/build-worker.mjs
node scripts/policy-smoke.mjs
```

현재 배포 주소: https://insight-ai-chat-0929.wls199832.chatgpt.site/
