// AVAGYM — Biblioteca de programas guiados (v2) + mídia e instruções dos exercícios.
// Formato igual a PROGRAMS de seed-data.js, com um 13º item opcional "meta".
const E = (id, s, a, b, rest = 60, dur = null) => [id, s, a, b, rest, dur]
const T = 'Equipe AVAGYM'

// exercício -> id do catálogo de mídia (exercises-dataset usado pelo app; imagem + animação)
export const MEDIA = {
  supino_reto_barra:'0025', supino_inclinado_halter:'0314', crucifixo_halter:'0308', flexao_bracos:'0662', flexao_joelhos:'3211',
  puxada_frente:'0198', barra_fixa:'0652', remada_curvada:'0027', remada_unilateral:'0292', remada_baixa:'0861',
  desenvolvimento_halter:'0405', elevacao_lateral:'0334', crucifixo_inverso:'0378', encolhimento:'0406', rotacao_externa_elastico:'0235',
  rosca_direta:'0031', rosca_martelo:'0313', triceps_polia:'0201', triceps_frances:'2188', mergulho_banco:'0129', rosca_punho:'0126',
  agachamento_livre:'0043', agachamento_goblet:'1760', leg_press:'0739', cadeira_extensora:'0585', afundo:'3470', stiff:'0432',
  mesa_flexora:'0586', levantamento_terra:'0032', elevacao_pelvica:'1409', ponte_gluteo:'3013', abducao_elastico:'0710',
  panturrilha_em_pe:'1373', panturrilha_sentado:'0594', abdominal_crunch:'0274', prancha:'2135', prancha_lateral:'0705',
  elevacao_pernas:'0620', bicicleta_abdominal:'0003', dead_bug:'0276', extensao_lombar:'0489', polichinelo:'3224', burpee:'1160',
  mountain_climber:'0630', swing_kettlebell:'0549', step_up:'0431', alongamento_posteriores:'1511', alongamento_flexor_quadril:'1512',
  // equivalentes próximos no mesmo catálogo (mobilidade / fisioterapia)
  remada_elastico:'3144', agachamento_peso_corporal:'3221', elevacao_perna_estendida:'1002', mini_agachamento_parede:'3221',
  ostra_clamshell:'3006', retracao_escapular:'0993', ytw_solo:'2470', gato_camelo:'1363', joelhos_ao_peito:'1709',
  rotacao_toracica:'3639', agachamento_profundo_mobilidade:'3119',
  // arquivos locais (Wikimedia Commons) em frontend/public/media/exercicios — créditos em CREDITS.md
  perdigueiro:'/media/exercicios/perdigueiro.jpg', pendulo_codman:'/media/exercicios/pendulo_codman.jpg'
}

// instruções curtas, linguagem simples (sem jargão)
export const INSTR = {
  supino_reto_barra: 'Deite no banco com os pés firmes no chão. Desça a barra até perto do peito, controlando, e empurre de volta.',
  supino_inclinado_halter: 'Banco inclinado. Desça os halteres ao lado do peito e empurre para cima, sem bater um no outro.',
  crucifixo_halter: 'Braços levemente dobrados. Abra devagar até sentir o peito alongar e feche em arco.',
  flexao_bracos: 'Mãos na largura dos ombros, corpo reto. Desça o peito perto do chão e empurre de volta.',
  flexao_joelhos: 'Como a flexão comum, mas com os joelhos apoiados. Mantenha o quadril alinhado.',
  puxada_frente: 'Segure a barra mais aberta que os ombros e puxe até o queixo, levando os cotovelos para baixo.',
  remada_curvada: 'Tronco inclinado e costas retas. Puxe a barra até a barriga e desça controlando.',
  remada_unilateral: 'Apoie uma mão e um joelho no banco. Puxe o halter até a cintura, sem girar o tronco.',
  remada_baixa: 'Sentado, coluna reta. Puxe o pegador até a barriga juntando as escápulas.',
  desenvolvimento_halter: 'Sentado, halteres na altura dos ombros. Empurre para cima sem arquear a lombar.',
  elevacao_lateral: 'Braços quase retos. Eleve os halteres até a altura dos ombros e desça devagar.',
  crucifixo_inverso: 'Tronco inclinado à frente. Abra os braços para os lados apertando a parte de trás dos ombros.',
  encolhimento: 'Halteres ao lado do corpo. Suba os ombros em direção às orelhas e desça devagar.',
  rosca_direta: 'Cotovelos colados ao corpo. Suba a barra dobrando os braços e desça sem balançar.',
  rosca_martelo: 'Palmas viradas uma para a outra. Suba os halteres sem mexer os cotovelos.',
  triceps_polia: 'Cotovelos fixos ao lado do corpo. Empurre a barra para baixo até esticar os braços.',
  triceps_frances: 'Halter acima da cabeça com as duas mãos. Desça atrás da cabeça e estique de novo.',
  mergulho_banco: 'Mãos firmes no banco e pés apoiados. Flexione os cotovelos até onde mantiver os ombros confortáveis e empurre para voltar.',
  agachamento_livre: 'Barra apoiada nas costas. Sente para trás como numa cadeira, joelhos na direção dos pés, e suba.',
  agachamento_peso_corporal: 'Pés na largura dos ombros. Sente para trás como numa cadeira e suba empurrando o chão.',
  agachamento_goblet: 'Segure o peso junto ao peito. Agache com o tronco alto e suba.',
  leg_press: 'Costas apoiadas no encosto. Desça a plataforma até os joelhos em 90° e empurre sem travar os joelhos.',
  cadeira_extensora: 'Ajuste o apoio no tornozelo. Estique as pernas e desça devagar.',
  afundo: 'Dê um passo à frente e desça o joelho de trás perto do chão. Volte e troque a perna.',
  stiff: 'Pernas quase retas, costas retas. Desça os halteres rente às pernas e suba contraindo o glúteo.',
  mesa_flexora: 'Deitado de bruços. Dobre os joelhos trazendo o apoio até o glúteo e desça devagar.',
  levantamento_terra: 'Barra perto das canelas, costas retas. Levante empurrando o chão com os pés.',
  elevacao_pelvica: 'Costas apoiadas no banco, barra no quadril. Suba o quadril apertando o glúteo.',
  ponte_gluteo: 'Deitado, joelhos dobrados. Suba o quadril até alinhar com o tronco e desça.',
  panturrilha_em_pe: 'Fique na ponta dos pés o mais alto possível e desça devagar.',
  panturrilha_sentado: 'Sentado com o apoio sobre os joelhos. Suba os calcanhares e desça devagar.',
  abdominal_crunch: 'Deitado, joelhos dobrados. Tire os ombros do chão contraindo a barriga, sem puxar o pescoço.',
  prancha: 'Apoie antebraços e pontas dos pés. Corpo reto, barriga firme. Segure o tempo indicado.',
  prancha_lateral: 'De lado, apoiado no antebraço. Quadril alto e corpo reto. Segure e troque de lado.',
  bicicleta_abdominal: 'Deitado, leve o cotovelo em direção ao joelho oposto, alternando.',
  perdigueiro: 'De quatro apoios, estique braço e perna opostos, segure 2 s e troque.',
  dead_bug: 'Deitado, braços para cima e joelhos a 90°. Estique braço e perna opostos sem tirar a lombar do chão.',
  polichinelo: 'Salte abrindo pernas e braços e volte fechando. Ritmo constante.',
  burpee: 'Agache, apoie as mãos, jogue as pernas para trás, volte e salte.',
  mountain_climber: 'Em posição de flexão, traga os joelhos ao peito alternando, rápido.',
  swing_kettlebell: 'Empurre o quadril para trás e projete o kettlebell à frente com a força do quadril.',
  step_up: 'Suba no banco/step com uma perna, apoie a outra e desça controlando.',
  isometria_quadriceps: 'Sentado, toalha sob o joelho. Empurre o joelho contra a toalha e segure.',
  elevacao_perna_estendida: 'Deitado, uma perna dobrada. Eleve a outra estendida até a altura do joelho oposto.',
  mini_agachamento_parede: 'Costas na parede. Desça pouco (sem dor), segure e suba.',
  ostra_clamshell: 'De lado, joelhos dobrados e elástico nas coxas. Abra o joelho de cima sem girar o quadril.',
  gato_camelo: 'De quatro apoios, arredonde as costas e depois afunde devagar, respirando.',
  rotacao_toracica: 'Deitado de lado, joelhos dobrados. Abra o braço de cima para o outro lado como um livro.',
  agachamento_profundo_mobilidade: 'Desça ao agachamento com os pés totalmente apoiados. Mantenha o peito aberto e respire sem forçar a amplitude.',
  ytw_solo: 'Deitado de barriga para baixo, forme as letras Y, T e W com os braços, elevando-os levemente sem encolher os ombros.',
  circulos_ombro: 'Braços abertos, faça círculos pequenos aumentando aos poucos.',
  pendulo_codman: 'Inclinado com apoio, deixe o braço solto e faça pequenos círculos.',
  retracao_escapular: 'Puxe o elástico juntando as escápulas, sem subir os ombros.',
  rotacao_externa_elastico: 'Cotovelo colado ao corpo a 90°. Gire o antebraço para fora contra o elástico.',
  alongamento_posteriores: 'Perna estendida à frente, incline o tronco até sentir alongar. Respire.',
  alongamento_flexor_quadril: 'Ajoelhado em afundo, leve o quadril à frente até sentir alongar a frente da coxa.',
  joelhos_ao_peito: 'Deitado, abrace os joelhos e traga ao peito suavemente.'
}

// ajustes nos 8 programas originais (objetivo/nível para a recomendação, autor, faixa de tempo)
export const OVERRIDES = {
  'iniciante-fullbody': { goal: 'hypertrophy', title: 'Massa muscular — Primeiros passos', minutes_max: 50 },
  'hipertrofia-abc': { title: 'Massa muscular 3x por semana', minutes_max: 70 },
  'casa-sem-equipamento': { goal: 'home' },
  'emagrecimento-circuito': { title: 'Emagrecimento na academia' },
  'mobilidade-diaria': {}
}

export const PROGRAMS2 = [
  ['massa-magra-abc','Massa Magra ABC','Programa de 8 semanas para ganhar massa, 4 treinos por semana: peito e tríceps, costas e bíceps, pernas e ombros.','hypertrophy','intermediate','gym',8,4,45,false,['massa magra','academia'],[
    ['A — Peito e tríceps','Peito + tríceps',[E('supino_reto_barra',4,8,12,90),E('supino_inclinado_halter',3,8,12,90),E('crucifixo_halter',3,10,12),E('flexao_bracos',2,8,15),E('triceps_polia',3,10,12),E('triceps_frances',3,10,12)]],
    ['B — Costas e bíceps','Costas + bíceps',[E('puxada_frente',4,8,12,90),E('remada_baixa',3,8,12,90),E('remada_unilateral',3,10,12),E('crucifixo_inverso',3,12,15),E('rosca_direta',3,8,12),E('rosca_martelo',3,10,12)]],
    ['C — Pernas','Pernas',[E('agachamento_livre',4,6,10,120),E('leg_press',3,10,12,90),E('cadeira_extensora',3,12,15),E('stiff',3,8,12,90),E('mesa_flexora',3,10,12),E('panturrilha_em_pe',4,12,15,45)]],
    ['D — Ombros e abdômen','Ombros + core',[E('desenvolvimento_halter',4,8,12,90),E('elevacao_lateral',4,12,15),E('crucifixo_inverso',3,12,15),E('encolhimento',3,12,15),E('abdominal_crunch',3,15,20,45),E('prancha',3,null,null,45,40)]]],
   { minutes_max: 60, author: T }],
  ['massa-iniciante-4x','Massa muscular para iniciantes 4x','Quatro treinos curtos por semana alternando membros superiores e inferiores. Ideal para começar a ganhar massa com segurança.','hypertrophy','beginner','gym',8,4,45,false,['massa','iniciante','academia'],[
    ['Membros superiores 1','Peito, costas e braços',[E('supino_inclinado_halter',3,10,12,75),E('puxada_frente',3,10,12,75),E('remada_baixa',3,10,12),E('elevacao_lateral',2,12,15),E('rosca_direta',2,10,12),E('triceps_polia',2,10,12)]],
    ['Membros inferiores 1','Pernas e core',[E('leg_press',3,10,12,90),E('cadeira_extensora',3,12,15),E('mesa_flexora',3,12,15),E('ponte_gluteo',3,12,15),E('prancha',3,null,null,45,30)]],
    ['Membros superiores 2','Ombros, costas e peito',[E('desenvolvimento_halter',3,10,12,75),E('remada_unilateral',3,10,12),E('flexao_joelhos',3,8,12),E('crucifixo_inverso',2,12,15),E('rosca_martelo',2,10,12)]],
    ['Membros inferiores 2','Pernas e glúteos',[E('agachamento_goblet',3,10,12,90),E('afundo',3,10,12),E('mesa_flexora',3,12,15),E('panturrilha_em_pe',3,15,20,45),E('dead_bug',3,8,10,45)]]],
   { minutes_max: 50, author: T }],
  ['massa-intermediario-5x','Massa muscular 5x por semana','Cinco treinos por semana para quem já treina há alguns meses e quer acelerar o ganho de massa.','hypertrophy','intermediate','gym',10,5,60,false,['massa','academia'],[
    ['Peito e ombros','Empurrar',[E('supino_reto_barra',4,6,10,120),E('supino_inclinado_halter',3,8,12,90),E('desenvolvimento_halter',3,8,12,90),E('elevacao_lateral',4,12,15),E('triceps_polia',3,10,12)]],
    ['Costas e bíceps','Puxar',[E('puxada_frente',4,8,12,90),E('remada_curvada',3,8,10,90),E('remada_baixa',3,10,12),E('crucifixo_inverso',3,12,15),E('rosca_direta',3,8,12)]],
    ['Pernas','Pernas',[E('agachamento_livre',4,6,10,120),E('leg_press',3,10,12,90),E('stiff',3,8,12,90),E('mesa_flexora',3,10,12),E('panturrilha_sentado',4,12,15,45)]],
    ['Membros superiores','Membros superiores',[E('supino_inclinado_halter',3,8,12,90),E('remada_unilateral',3,8,12),E('desenvolvimento_halter',3,10,12),E('rosca_martelo',3,10,12),E('triceps_frances',3,10,12)]],
    ['Pernas e glúteos','Pernas',[E('elevacao_pelvica',4,8,12,90),E('afundo',3,10,12),E('cadeira_extensora',3,12,15),E('mesa_flexora',3,12,15),E('abdominal_crunch',3,15,20,45)]]],
   { minutes_max: 75, author: T }],
  ['emagrecimento-casa','Emagrecimento em casa','Circuitos com halteres leves e elástico para queimar calorias em casa, 3 vezes por semana.','weight_loss','beginner','home',6,3,30,false,['emagrecimento','em casa'],[
    ['Circuito 1','Corpo inteiro',[E('agachamento_goblet',3,12,15,30),E('remada_unilateral',3,12,15,30),E('afundo',3,10,12,30),E('desenvolvimento_halter',3,10,12,30),E('mountain_climber',3,null,null,30,30)]],
    ['Circuito 2','Corpo inteiro',[E('stiff',3,12,15,30),E('flexao_joelhos',3,8,12,30),E('ponte_gluteo',3,15,20,30),E('rosca_martelo',3,12,15,30),E('polichinelo',3,null,null,30,40)]]],
   { minutes_max: 35, author: T }],
  ['emagrecimento-sem-equipamento','Emagrecimento sem equipamento','Treinos com o peso do corpo, sem nenhum aparelho. Basta um espaço no chão, 4 vezes por semana.','weight_loss','beginner','home_noequip',6,4,30,false,['emagrecimento','sem equipamento'],[
    ['Pernas e cardio','Pernas',[E('agachamento_peso_corporal',3,15,20,30),E('afundo',3,10,12,30),E('polichinelo',3,null,null,30,40),E('ponte_gluteo',3,15,20,30),E('prancha',3,null,null,30,30)]],
    ['Membros superiores e cardio','Membros superiores',[E('flexao_joelhos',3,8,12,30),E('mountain_climber',3,null,null,30,30),E('bicicleta_abdominal',3,20,30,30),E('dead_bug',3,10,12,30),E('polichinelo',3,null,null,30,40)]]],
   { minutes_max: 35, author: T }],
  ['emagrecimento-hiit','Condicionamento intervalado (HIIT)','Sessões curtas e intensas: esforço forte por alguns segundos e pausa curta. 20 minutos, 3 vezes por semana.','weight_loss','intermediate','home_noequip',4,3,20,false,['emagrecimento','intervalado','rápido'],[
    ['Intervalado 1','Corpo inteiro',[E('polichinelo',4,null,null,20,30),E('agachamento_peso_corporal',4,15,20,20),E('mountain_climber',4,null,null,20,30),E('burpee',4,8,10,30)]],
    ['Intervalado 2','Corpo inteiro',[E('afundo',4,10,12,20),E('flexao_bracos',4,8,12,20),E('bicicleta_abdominal',4,20,30,20),E('polichinelo',4,null,null,20,30)]]],
   { minutes_max: 25, author: T }],
  ['forca-iniciante','Força — Base','Ficar mais forte nos movimentos principais com poucas repetições e descanso maior. 3 vezes por semana.','strength','beginner','gym',8,3,60,false,['força','academia'],[
    ['Força 1','Agachar e empurrar',[E('agachamento_goblet',4,6,8,120),E('supino_inclinado_halter',4,6,8,120),E('remada_baixa',3,8,10,90),E('prancha',3,null,null,60,30)]],
    ['Força 2','Levantar e puxar',[E('leg_press',4,6,8,120),E('puxada_frente',4,6,8,120),E('desenvolvimento_halter',3,8,10,90),E('ponte_gluteo',3,10,12,60)]]],
   { minutes_max: 70, author: T }],
  ['forca-intermediario','Força 4x por semana','Para quem já domina os movimentos: agachamento, supino, levantamento terra e desenvolvimento com progressão de carga.','strength','intermediate','gym',10,4,60,false,['força','academia'],[
    ['Agachamento','Pernas',[E('agachamento_livre',5,4,6,180),E('leg_press',3,6,8,120),E('mesa_flexora',3,8,10,90)]],
    ['Supino','Peito',[E('supino_reto_barra',5,4,6,180),E('supino_inclinado_halter',3,6,8,120),E('triceps_polia',3,8,10,90)]],
    ['Levantamento terra','Posterior',[E('levantamento_terra',5,3,5,180),E('remada_curvada',3,6,8,120),E('rosca_direta',3,8,10,90)]],
    ['Desenvolvimento','Ombros',[E('desenvolvimento_halter',5,5,6,150),E('puxada_frente',3,6,8,120),E('elevacao_lateral',3,10,12,60)]]],
   { minutes_max: 75, author: T }],
  ['condicionamento-geral','Condicionamento — Fôlego e disposição','Melhore o fôlego e a resistência com circuitos simples, sem equipamento. 3 vezes por semana.','conditioning','beginner','home_noequip',6,3,30,false,['condicionamento','fôlego'],[
    ['Circuito fôlego','Corpo inteiro',[E('polichinelo',3,null,null,30,45),E('agachamento_peso_corporal',3,15,20,30),E('mountain_climber',3,null,null,30,30),E('flexao_joelhos',3,8,12,30),E('prancha',3,null,null,30,30)]],
    ['Circuito resistência','Corpo inteiro',[E('afundo',3,12,12,30),E('polichinelo',3,null,null,30,45),E('ponte_gluteo',3,15,20,30),E('bicicleta_abdominal',3,20,20,30)]]],
   { minutes_max: 35, author: T }],
  ['condicionamento-academia','Condicionamento na academia','Circuitos com kettlebell, máquinas e peso do corpo para resistência e disposição. 4 vezes por semana.','conditioning','intermediate','gym',6,4,45,false,['condicionamento','academia'],[
    ['Circuito potência','Corpo inteiro',[E('swing_kettlebell',4,15,20,45),E('agachamento_goblet',4,12,15,45),E('burpee',3,8,10,45),E('remada_baixa',3,12,15,45)]],
    ['Circuito resistência','Corpo inteiro',[E('leg_press',3,15,20,45),E('puxada_frente',3,12,15,45),E('mountain_climber',3,null,null,30,40),E('step_up',3,10,12,45)]]],
   { minutes_max: 50, author: T }],
  ['mobilidade-completa','Mobilidade articular','Sessões de 30 minutos para trabalhar a mobilidade de quadril, coluna e ombros e melhorar a postura. 3 vezes por semana.','mobility','beginner','home_noequip',6,3,30,false,['mobilidade','postura'],[
    ['Coluna e quadril','Mobilidade',[E('gato_camelo',3,10,10,15),E('rotacao_toracica',3,8,10,15),E('alongamento_flexor_quadril',3,null,null,15,40),E('agachamento_profundo_mobilidade',3,null,null,15,40),E('joelhos_ao_peito',2,null,null,15,40)]],
    ['Ombros e pernas','Mobilidade',[E('circulos_ombro',3,10,10,15),E('ytw_solo',3,8,10,30),E('alongamento_posteriores',3,null,null,15,40),E('ponte_gluteo',3,12,12,30)]]],
   { minutes_max: 30, author: T }],
  ['casa-halteres','Treino em casa com halteres','Com um par de halteres e um elástico você treina o corpo todo em casa. 4 vezes por semana.','home','intermediate','home',8,4,45,false,['em casa','halteres'],[
    ['Membros superiores','Peito, costas, ombros',[E('flexao_bracos',3,8,15,60),E('remada_unilateral',4,10,12,60),E('desenvolvimento_halter',3,10,12,60),E('elevacao_lateral',3,12,15),E('rosca_martelo',3,10,12)]],
    ['Pernas','Pernas e glúteos',[E('agachamento_goblet',4,10,15,75),E('afundo',3,10,12,60),E('stiff',3,10,12,60),E('ponte_gluteo',3,15,20,45),E('panturrilha_em_pe',3,15,20,30)]]],
   { minutes_max: 50, author: T }],
  ['fisio-mobilidade','Fisioterapia — Mobilidade e postura','Exercícios suaves para recuperar movimento com segurança. Não substitui a avaliação de um fisioterapeuta.','rehab','beginner','home_noequip',6,3,20,true,['fisioterapia','mobilidade'],[
    ['Mobilidade suave','Coluna, quadril e ombros',[E('gato_camelo',2,10,10,20),E('joelhos_ao_peito',2,null,null,20,30),E('circulos_ombro',2,10,10,20),E('rotacao_toracica',2,8,8,20),E('ponte_gluteo',2,10,12,30),E('alongamento_posteriores',2,null,null,20,30)]]],
   { minutes_max: 25, author: T, contraindications: [] }]
]
