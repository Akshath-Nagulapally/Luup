// prerequirements 
Have Docker installed

copy  .env.dev.example to .env and add new env variables GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET comment out GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET env variables 
newly added env variables 
NEXT_PUBLIC_FLOWISE_URL
NEXT_PUBLIC_BUILDER_URL

Running project

pnpm i
pnpm dev
visit localhost:3000/


// deploying to server 

run pnpm i at root
run pnpm turbo build --filter=builder... 
run pnpm turbo build --filter=viewer...

go to apps/builder 
create new pm2 process to create next build
go to apps/viewer 
create new pm2 process to create next build 

