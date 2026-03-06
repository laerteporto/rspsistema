# Regras do Firebase Firestore — RSP Sistema

## ⚠️ PASSO OBRIGATÓRIO antes de usar o sistema

O Firebase bloqueia leitura/escrita por padrão. Siga os passos:

1. Acesse: https://console.firebase.google.com/project/rpssystem/firestore/rules
2. Substitua o conteúdo das regras por:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

3. Clique em **Publicar**

Isso libera acesso para o sistema funcionar. Para produção com múltiplos usuários,
adicione autenticação futuramente.
