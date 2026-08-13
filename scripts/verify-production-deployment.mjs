const isVercelProduction = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production';

if (isVercelProduction) {
  const sourceBranch = process.env.VERCEL_GIT_COMMIT_REF;
  if (sourceBranch !== 'main') {
    throw new Error('Deploy de produção bloqueado: a origem deve ser a branch main via integração Git.');
  }
  if (process.env.APP_ENV !== 'production') {
    throw new Error('Deploy de produção bloqueado: APP_ENV=production é obrigatório.');
  }
}
