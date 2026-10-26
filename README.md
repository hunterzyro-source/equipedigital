# Equipe Digital

Painel web com servidor Node.js integrado, login privado e gestão de contas pela administração.

## Iniciar

1. Instale o Node.js 20 ou mais recente.
2. Abra esta pasta no terminal.
3. Execute `npm start` e acesse `http://localhost:3000`.

O login inicial do administrador está definido no arquivo `.env` (`ADMIN_USERNAME` e `ADMIN_PASSWORD`). Troque a senha antes de colocar o site em um servidor público. A configuração local fica fora do controle de versão.

## Contas e acesso

- Não existe cadastro público.
- O administrador cria, ativa, desativa e redefine as senhas das contas pelo painel.
- O administrador pode abrir a visualização de uma conta e voltar à administração sem conhecer a senha da pessoa.
- As senhas são armazenadas com `scrypt`. Contas e dados ficam no PostgreSQL privado do Supabase quando `DATABASE_URL` está configurada; sem ela, o modo local usa arquivos JSON em `data/`.
- Pessoas da equipe podem enviar links ilimitados. Cada link recebe um ID e fica pendente até a análise administrativa.
- Aprovar um link soma ao saldo ilustrativo da pessoa o valor configurado pelo administrador em “Valores dos links” (R$ 50,00 por padrão). A nova configuração vale para as próximas aprovações; os valores já aprovados ficam registrados. Desaprovar não adiciona saldo; cada link só pode ser decidido uma vez.
- A navegação separa Visão geral, Criar conta, Contas registradas, Links e Configurações.
- Configurações permite alterar nome, usuário, e-mail, foto e senha, escolher tema claro ou escuro e ativar o layout compacto. As mudanças nos dados do administrador também atualizam as chaves correspondentes no `.env`.
- A área administrativa permite filtrar links por pessoa e status, copiar o endereço e aprovar ou desaprovar. O TXT exportado inclui IDs, links, status, pessoa e datas; ao filtrar uma conta, o nome de usuário é usado no nome do arquivo.
- Cada conta pode enviar uma foto de perfil em PNG, JPG ou WebP (até 3 MB), salva no Supabase no modo de produção e localmente no modo JSON.
- “Lembrar meu login” guarda somente o nome de usuário neste aparelho. A sessão usa cookie HTTP-only e dura um dia; com a opção de lembrar o login marcada, dura até 30 dias. No modo local as sessões são encerradas ao reiniciar; no modo Supabase, elas são persistentes.

## Supabase e Vercel

- O backend usa PostgreSQL do Supabase quando `DATABASE_URL` está configurada. Em desenvolvimento local sem essa variável, os arquivos JSON continuam disponíveis.
- Defina `DATABASE_URL` com o pooler compartilhado em modo transaction (porta 6543) para a aplicação/Vercel e `DIRECT_URL` com o pooler em modo session (porta 5432) para a migração.
- Configure também `ADMIN_NAME`, `ADMIN_USERNAME`, `ADMIN_EMAIL` e uma senha forte `ADMIN_PASSWORD` no projeto Vercel.
- Aplique a migração com `npm run db:migrate` após configurar o `.env`. Os dados locais existentes são carregados para o banco quando ele é iniciado pela primeira vez.
- O estado privado da aplicação fica em um schema não exposto à API pública do Supabase, com RLS ativo e sem acesso para `anon`/`authenticated`. A aplicação usa apenas conexão server-side; nenhuma chave secreta é enviada ao navegador.
- O arquivo `vercel.json` encaminha as rotas de API e fotos ao backend Node.js. Conecte o repositório GitHub ao projeto Vercel e cadastre as variáveis de ambiente acima em Production, Preview e Development conforme necessário.
- Não versione `.env`, credenciais, nem `data/`. Se uma credencial for compartilhada publicamente, revogue-a e gere uma nova.
