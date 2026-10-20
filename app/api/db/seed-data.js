// Dados de seed: equipamentos, exercícios básicos e Biblioteca de Treinos.
export const EQUIPMENT = [
  ['peso_corporal','Peso corporal'],['halter','Halteres'],['barra','Barra'],['maquina','Máquina'],['polia','Polia / cabo'],
  ['elastico','Elástico'],['kettlebell','Kettlebell'],['banco','Banco'],['colchonete','Colchonete'],['barra_fixa','Barra fixa']
]
// [id, nome, equipamento, nível, grupos primários, grupos secundários, músculos primários (rótulo base Z-Anatomy), contraindicações]
export const EXERCISES = [
  ['supino_reto_barra','Supino reto com barra','barra','intermediate',['peito'],['triceps','ombros'],['Sternocostal head of pectoralis major muscle','Clavicular head of pectoralis major muscle'],{shoulder:'caution'}],
  ['supino_inclinado_halter','Supino inclinado com halteres','halter','intermediate',['peito'],['ombros','triceps'],['Clavicular head of pectoralis major muscle','Clavicular part of deltoid muscle'],{shoulder:'caution'}],
  ['crucifixo_halter','Crucifixo com halteres','halter','beginner',['peito'],['ombros'],['Sternocostal head of pectoralis major muscle'],{shoulder:'caution'}],
  ['flexao_bracos','Flexão de braços','peso_corporal','beginner',['peito'],['triceps','ombros','abdomen'],['Sternocostal head of pectoralis major muscle','Serratus anterior muscle'],{}],
  ['flexao_joelhos','Flexão de braços com joelhos apoiados','peso_corporal','beginner',['peito'],['triceps'],['Sternocostal head of pectoralis major muscle'],{}],
  ['puxada_frente','Puxada frontal na polia','polia','beginner',['costas'],['biceps'],['Latissimus dorsi muscle','Teres major muscle'],{}],
  ['barra_fixa','Barra fixa (pegada pronada)','barra_fixa','advanced',['costas'],['biceps','antebraco'],['Latissimus dorsi muscle','Teres major muscle'],{shoulder:'caution'}],
  ['remada_curvada','Remada curvada com barra','barra','intermediate',['costas'],['biceps','lombar','trapezio'],['Latissimus dorsi muscle','Rhomboid major muscle'],{lumbar:'avoid'}],
  ['remada_unilateral','Remada unilateral com halter','halter','beginner',['costas'],['biceps'],['Latissimus dorsi muscle','Rhomboid major muscle'],{}],
  ['remada_baixa','Remada baixa sentada na polia','polia','beginner',['costas'],['biceps','trapezio'],['Rhomboid major muscle','Transverse part of trapezius muscle'],{}],
  ['remada_elastico','Remada com elástico','elastico','beginner',['costas'],['biceps'],['Rhomboid major muscle','Latissimus dorsi muscle'],{}],
  ['desenvolvimento_halter','Desenvolvimento com halteres','halter','intermediate',['ombros'],['triceps','trapezio'],['Clavicular part of deltoid muscle','Acromial part of deltoid muscle'],{shoulder:'caution'}],
  ['elevacao_lateral','Elevação lateral','halter','beginner',['ombros'],['trapezio'],['Acromial part of deltoid muscle'],{}],
  ['crucifixo_inverso','Crucifixo inverso','halter','beginner',['ombros'],['costas','trapezio'],['Scapular spinal part of deltoid muscle','Infraspinatus muscle'],{}],
  ['encolhimento','Encolhimento com halteres','halter','beginner',['trapezio'],[],['Descending part of trapezius muscle','Levator scapulae'],{}],
  ['rotacao_externa_elastico','Rotação externa de ombro com elástico','elastico','beginner',['ombros'],['costas'],['Infraspinatus muscle','Teres minor muscle'],{}],
  ['rosca_direta','Rosca direta com barra','barra','beginner',['biceps'],['antebraco'],['Long head of biceps brachii','Short head of biceps brachii','Brachialis muscle'],{}],
  ['rosca_martelo','Rosca martelo','halter','beginner',['biceps','antebraco'],[],['Brachioradialis muscle','Brachialis muscle'],{}],
  ['triceps_polia','Tríceps na polia (pulley)','polia','beginner',['triceps'],[],['Lateral head of triceps brachii','Medial head of triceps brachii'],{}],
  ['triceps_frances','Tríceps francês com halter','halter','intermediate',['triceps'],[],['Long head of triceps brachii'],{shoulder:'caution'}],
  ['mergulho_banco','Mergulho no banco','banco','beginner',['triceps'],['peito','ombros'],['Long head of triceps brachii','Lateral head of triceps brachii'],{shoulder:'avoid'}],
  ['rosca_punho','Rosca de punho','halter','beginner',['antebraco'],[],['Flexor carpi radialis','Flexor digitorum superficialis'],{}],
  ['agachamento_livre','Agachamento livre com barra','barra','intermediate',['quadriceps','gluteos'],['posteriores','lombar'],['Rectus femoris muscle','Vastus lateralis muscle','Vastus medialis muscle','Gluteus maximus muscle'],{knee:'caution',lumbar:'caution'}],
  ['agachamento_peso_corporal','Agachamento livre (peso corporal)','peso_corporal','beginner',['quadriceps','gluteos'],['posteriores'],['Vastus lateralis muscle','Vastus medialis muscle','Gluteus maximus muscle'],{knee:'caution'}],
  ['agachamento_goblet','Agachamento goblet','kettlebell','beginner',['quadriceps','gluteos'],['abdomen'],['Vastus lateralis muscle','Gluteus maximus muscle'],{knee:'caution'}],
  ['leg_press','Leg press 45°','maquina','beginner',['quadriceps','gluteos'],['posteriores'],['Vastus lateralis muscle','Vastus medialis muscle','Gluteus maximus muscle'],{knee:'caution'}],
  ['cadeira_extensora','Cadeira extensora','maquina','beginner',['quadriceps'],[],['Rectus femoris muscle','Vastus medialis muscle','Vastus lateralis muscle'],{knee:'caution'}],
  ['afundo','Afundo (passada)','peso_corporal','beginner',['quadriceps','gluteos'],['posteriores'],['Vastus lateralis muscle','Gluteus maximus muscle'],{knee:'caution'}],
  ['stiff','Stiff com halteres','halter','intermediate',['posteriores','gluteos'],['lombar'],['Long head of biceps femoris','Semitendinosus muscle','Semimembranosus muscle'],{lumbar:'caution'}],
  ['mesa_flexora','Mesa flexora','maquina','beginner',['posteriores'],['panturrilhas'],['Long head of biceps femoris','Semitendinosus muscle'],{}],
  ['levantamento_terra','Levantamento terra','barra','advanced',['posteriores','gluteos','lombar'],['costas','trapezio','quadriceps'],['Gluteus maximus muscle','Iliocostalis lumborum muscle','Long head of biceps femoris'],{lumbar:'avoid'}],
  ['elevacao_pelvica','Elevação pélvica (hip thrust)','barra','intermediate',['gluteos'],['posteriores'],['Gluteus maximus muscle','Gluteus medius muscle'],{}],
  ['ponte_gluteo','Ponte de glúteo no solo','colchonete','beginner',['gluteos'],['posteriores','lombar'],['Gluteus maximus muscle'],{}],
  ['abducao_elastico','Abdução de quadril com elástico','elastico','beginner',['gluteos'],[],['Gluteus medius muscle','Gluteus minimus muscle'],{}],
  ['panturrilha_em_pe','Elevação de panturrilha em pé','peso_corporal','beginner',['panturrilhas'],[],['Medial head of gastrocnemius','Lateral head of gastrocnemius','Soleus muscle'],{}],
  ['panturrilha_sentado','Panturrilha sentado','maquina','beginner',['panturrilhas'],[],['Soleus muscle'],{}],
  ['abdominal_crunch','Abdominal crunch','colchonete','beginner',['abdomen'],[],['Rectus abdominis muscle'],{lumbar:'caution'}],
  ['prancha','Prancha frontal','colchonete','beginner',['abdomen'],['obliquos','ombros','lombar'],['Rectus abdominis muscle','Transversus abdominis'],{}],
  ['prancha_lateral','Prancha lateral','colchonete','beginner',['obliquos'],['abdomen','gluteos'],['External abdominal oblique muscle','Internal abdominal oblique muscle','Quadratus lumborum muscle'],{}],
  ['elevacao_pernas','Elevação de pernas deitado','colchonete','intermediate',['abdomen'],[],['Rectus abdominis muscle','Iliacus muscle','Psoas major'],{lumbar:'caution'}],
  ['bicicleta_abdominal','Abdominal bicicleta','colchonete','beginner',['obliquos','abdomen'],[],['External abdominal oblique muscle','Rectus abdominis muscle'],{}],
  ['perdigueiro','Perdigueiro (bird dog)','colchonete','beginner',['lombar'],['gluteos','abdomen'],['Multifidus lumborum muscle','Longissimus thoracis muscle','Gluteus maximus muscle'],{}],
  ['dead_bug','Dead bug','colchonete','beginner',['abdomen'],['obliquos'],['Rectus abdominis muscle','External abdominal oblique muscle'],{}],
  ['extensao_lombar','Extensão lombar no solo (superman)','colchonete','beginner',['lombar'],['gluteos'],['Iliocostalis lumborum muscle','Longissimus thoracis muscle'],{lumbar:'caution'}],
  ['polichinelo','Polichinelo','peso_corporal','beginner',['panturrilhas','ombros'],['quadriceps'],['Soleus muscle','Acromial part of deltoid muscle'],{knee:'caution'}],
  ['burpee','Burpee','peso_corporal','intermediate',['quadriceps','peito'],['ombros','abdomen','gluteos'],['Vastus lateralis muscle','Sternocostal head of pectoralis major muscle'],{knee:'caution',lumbar:'caution'}],
  ['mountain_climber','Escalador (mountain climber)','peso_corporal','beginner',['abdomen'],['ombros','quadriceps'],['Rectus abdominis muscle','Iliacus muscle'],{}],
  ['swing_kettlebell','Swing com kettlebell','kettlebell','intermediate',['gluteos','posteriores'],['lombar','ombros'],['Gluteus maximus muscle','Long head of biceps femoris'],{lumbar:'caution'}],
  ['isometria_quadriceps','Isometria de quadríceps (toalha sob o joelho)','colchonete','beginner',['quadriceps'],[],['Vastus medialis muscle'],{}],
  ['elevacao_perna_estendida','Elevação de perna estendida deitado','colchonete','beginner',['quadriceps'],['abdomen'],['Rectus femoris muscle'],{}],
  ['mini_agachamento_parede','Mini agachamento na parede','peso_corporal','beginner',['quadriceps','gluteos'],[],['Vastus medialis muscle','Gluteus maximus muscle'],{}],
  ['ostra_clamshell','Ostra (clamshell) com elástico','elastico','beginner',['gluteos'],[],['Gluteus medius muscle','Piriformis muscle'],{}],
  ['step_up','Subida no step','banco','beginner',['quadriceps','gluteos'],[],['Vastus medialis muscle','Gluteus maximus muscle'],{knee:'caution'}],
  ['pendulo_codman','Pêndulo de Codman','peso_corporal','beginner',['ombros'],[],['Supraspinatus muscle'],{}],
  ['retracao_escapular','Retração escapular','elastico','beginner',['costas','trapezio'],[],['Rhomboid major muscle','Transverse part of trapezius muscle'],{}],
  ['ytw_solo','Y-T-W deitado','colchonete','beginner',['trapezio','ombros'],['costas'],['Ascending part of trapezius muscle','Scapular spinal part of deltoid muscle'],{}],
  ['gato_camelo','Gato-camelo (mobilidade da coluna)','colchonete','beginner',['lombar'],['abdomen'],['Multifidus lumborum muscle','Rectus abdominis muscle'],{}],
  ['joelhos_ao_peito','Joelhos ao peito (alongamento lombar)','colchonete','beginner',['lombar','gluteos'],[],['Iliocostalis lumborum muscle','Gluteus maximus muscle'],{}],
  ['alongamento_flexor_quadril','Alongamento de flexores do quadril','colchonete','beginner',['quadriceps'],[],['Psoas major','Iliacus muscle','Rectus femoris muscle'],{}],
  ['alongamento_posteriores','Alongamento de posteriores de coxa','colchonete','beginner',['posteriores'],[],['Semitendinosus muscle','Long head of biceps femoris'],{}],
  ['rotacao_toracica','Rotação torácica (open book)','colchonete','beginner',['costas','obliquos'],[],['External abdominal oblique muscle','Rhomboid major muscle'],{}],
  ['circulos_ombro','Círculos de ombro','peso_corporal','beginner',['ombros'],[],['Acromial part of deltoid muscle'],{}],
  ['agachamento_profundo_mobilidade','Agachamento profundo sustentado (mobilidade)','peso_corporal','beginner',['quadriceps','gluteos'],['panturrilhas'],['Gluteus maximus muscle','Adductor magnus'],{knee:'caution'}]
]
// programas: [slug, título, descrição, goal, level, location, weeks, dias, min, reabilitação, tags, treinos]
// treino: [nome, foco, [[exercício, séries, repsMin, repsMax, descanso(s), duração(s)?]]]
const E = (id, s, a, b, rest = 60, dur = null) => [id, s, a, b, rest, dur]
export const PROGRAMS = [
  ['hipertrofia-abc','Massa magra / Hipertrofia (ABC)','Divisão ABC clássica para ganho de massa muscular, 3 a 6x por semana.','hypertrophy','intermediate','gym',8,3,60,false,['hipertrofia','massa magra','academia'],[
    ['Treino A — Peito, ombros e tríceps','Empurrar',[E('supino_reto_barra',4,8,12,90),E('supino_inclinado_halter',3,8,12,90),E('crucifixo_halter',3,10,12),E('desenvolvimento_halter',3,8,12,90),E('elevacao_lateral',3,12,15),E('triceps_polia',3,10,12),E('triceps_frances',3,10,12)]],
    ['Treino B — Costas e bíceps','Puxar',[E('puxada_frente',4,8,12,90),E('remada_curvada',4,8,12,90),E('remada_unilateral',3,10,12),E('crucifixo_inverso',3,12,15),E('encolhimento',3,12,15),E('rosca_direta',3,8,12),E('rosca_martelo',3,10,12)]],
    ['Treino C — Pernas e core','Pernas',[E('agachamento_livre',4,6,10,120),E('leg_press',3,10,12,90),E('cadeira_extensora',3,12,15),E('stiff',3,8,12,90),E('mesa_flexora',3,10,12),E('elevacao_pelvica',3,8,12,90),E('panturrilha_em_pe',4,12,20),E('prancha',3,null,null,45,45)]]]],
  ['emagrecimento-circuito','Emagrecimento (circuito metabólico)','Circuitos de corpo inteiro com descanso curto para gasto calórico, 3–4x por semana.','weight_loss','beginner','gym',6,3,45,false,['emagrecimento','circuito','queima'],[
    ['Circuito A — Corpo inteiro','Metabólico',[E('agachamento_goblet',3,12,15,30),E('flexao_bracos',3,10,15,30),E('remada_baixa',3,12,15,30),E('afundo',3,10,12,30),E('mountain_climber',3,null,null,30,40),E('polichinelo',3,null,null,30,45)]],
    ['Circuito B — Corpo inteiro','Metabólico',[E('swing_kettlebell',3,15,20,30),E('leg_press',3,15,20,30),E('puxada_frente',3,12,15,30),E('burpee',3,8,12,45),E('bicicleta_abdominal',3,20,30,30),E('prancha',3,null,null,30,40)]]]],
  ['iniciante-fullbody','Iniciante — Corpo inteiro','Primeiros 2 meses: técnica, adaptação e constância. 3x por semana em dias alternados.','general','beginner','gym',8,3,45,false,['iniciante','full body'],[
    ['Treino A','Corpo inteiro',[E('leg_press',3,12,15),E('puxada_frente',3,12,15),E('supino_inclinado_halter',3,12,15),E('mesa_flexora',3,12,15),E('elevacao_lateral',2,12,15),E('prancha',3,null,null,45,30)]],
    ['Treino B','Corpo inteiro',[E('agachamento_goblet',3,10,12),E('remada_baixa',3,12,15),E('flexao_joelhos',3,8,12),E('ponte_gluteo',3,12,15),E('rosca_direta',2,12,15),E('triceps_polia',2,12,15)]]]],
  ['fisio-lombar','Fisioterapia — Lombar','Estabilização do core e mobilidade para dor lombar inespecífica. Siga orientação do seu fisioterapeuta.','rehab','beginner','home',6,3,25,true,['fisioterapia','lombar','coluna','reabilitação'],[
    ['Estabilização lombar','Core / coluna',[E('gato_camelo',2,10,10,30),E('joelhos_ao_peito',2,null,null,30,30),E('perdigueiro',3,8,10,45),E('dead_bug',3,8,10,45),E('ponte_gluteo',3,10,12,45),E('prancha_lateral',2,null,null,45,20),E('alongamento_flexor_quadril',2,null,null,30,30)]]]],
  ['fisio-joelho','Fisioterapia — Joelho','Fortalecimento progressivo de quadríceps e glúteos para dor/instabilidade no joelho. Siga orientação profissional.','rehab','beginner','home',6,3,25,true,['fisioterapia','joelho','reabilitação'],[
    ['Fortalecimento de joelho','Quadríceps / glúteos',[E('isometria_quadriceps',3,10,10,30),E('elevacao_perna_estendida',3,10,12,45),E('ostra_clamshell',3,12,15,45),E('ponte_gluteo',3,12,15,45),E('mini_agachamento_parede',3,10,12,60),E('step_up',2,8,10,60),E('panturrilha_em_pe',3,12,15,45)]]]],
  ['fisio-ombro','Fisioterapia — Ombro','Mobilidade e fortalecimento do manguito rotador e estabilizadores da escápula. Siga orientação profissional.','rehab','beginner','home',6,3,20,true,['fisioterapia','ombro','manguito','reabilitação'],[
    ['Reabilitação de ombro','Manguito / escápula',[E('pendulo_codman',2,null,null,30,45),E('circulos_ombro',2,10,10,30),E('retracao_escapular',3,12,15,45),E('rotacao_externa_elastico',3,12,15,45),E('ytw_solo',2,8,10,45),E('remada_elastico',3,12,15,45)]]]],
  ['mobilidade-diaria','Mobilidade diária','Rotina curta de mobilidade de quadril, coluna e ombros — ideal ao acordar ou antes do treino.','mobility','beginner','home_noequip',4,5,15,false,['mobilidade','alongamento'],[
    ['Mobilidade geral','Quadril, coluna e ombros',[E('gato_camelo',2,10,10,15),E('rotacao_toracica',2,8,10,15),E('circulos_ombro',2,10,10,15),E('alongamento_flexor_quadril',2,null,null,15,30),E('alongamento_posteriores',2,null,null,15,30),E('agachamento_profundo_mobilidade',2,null,null,15,40)]]]],
  ['casa-sem-equipamento','Em casa sem equipamento','Treino com peso corporal para fazer em casa, 3–4x por semana.','general','beginner','home_noequip',6,3,30,false,['em casa','sem equipamento','peso corporal'],[
    ['Treino A — Inferiores e core','Pernas / core',[E('agachamento_peso_corporal',4,15,20,45),E('afundo',3,10,12,45),E('ponte_gluteo',3,15,20,45),E('panturrilha_em_pe',3,15,20,30),E('prancha',3,null,null,30,40),E('bicicleta_abdominal',3,20,20,30)]],
    ['Treino B — Superiores e cardio','Empurrar / cardio',[E('flexao_bracos',4,8,15,60),E('mergulho_banco',3,8,12,60),E('ytw_solo',3,8,10,45),E('mountain_climber',3,null,null,30,40),E('burpee',3,8,10,45),E('polichinelo',3,null,null,30,45)]]]]
]
