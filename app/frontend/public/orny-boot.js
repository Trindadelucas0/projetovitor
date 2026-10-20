function ornyBootError(){var box=document.getElementById('orny-boot');if(box){box.setAttribute('role','alert');document.getElementById('orny-boot-message').textContent='Não foi possível abrir a ORNY. Confira sua conexão e tente novamente.';document.getElementById('orny-boot-retry').hidden=false}}
window.addEventListener('error',function(e){if(e.target && e.target.tagName==='SCRIPT')ornyBootError()},true);
window.addEventListener('unhandledrejection',ornyBootError);
setTimeout(ornyBootError,20000);

document.getElementById('orny-boot-retry')?.addEventListener('click', () => location.reload())
