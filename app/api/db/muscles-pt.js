// Tradução pt-BR (nomenclatura anatômica) das malhas do corpo.glb (Z-Anatomy, CC BY-SA 4.0).
// chave = rótulo base da malha (sem lado); valor = [nome pt-BR, grupo (se o GLB não trouxer)]
export const GROUPS = [
  ['peito','Peito',1],['ombros','Ombros',1],['biceps','Bíceps',1],['triceps','Tríceps',1],['antebraco','Antebraço',1],
  ['abdomen','Abdômen',1],['obliquos','Oblíquos',1],['costas','Costas/Dorsal',1],['trapezio','Trapézio',1],['lombar','Lombar',1],
  ['gluteos','Glúteos',1],['quadriceps','Quadríceps',1],['posteriores','Posteriores de coxa',1],['panturrilhas','Panturrilhas',1],
  ['adutores','Adutores',0],['pescoco','Pescoço',0],['cabeca','Cabeça e face',0],['manguito','Manguito rotador',0],
  ['perna','Perna (tibiais e fibulares)',0],['quadril','Quadril profundo',0],['mao','Mão',0],['pe','Pé',0],['torax','Tórax',0]
]
export const PT = {
  'Iliopectineal arch':['Arco iliopectíneo','quadril'],
  'Frontalis muscle':['Músculo frontal','cabeca'],'Occipitalis muscle':['Músculo occipital','cabeca'],'Temporoparietalis muscle':['Músculo temporoparietal','cabeca'],
  'Nasalis muscle':['Músculo nasal','cabeca'],'Orbital part of orbicularis oculi':['Orbicular do olho (parte orbital)','cabeca'],'Palpebral part of orbicularis oculi':['Orbicular do olho (parte palpebral)','cabeca'],
  'Orbicularis oris muscle':['Orbicular da boca','cabeca'],'Zygomaticus major muscle':['Zigomático maior','cabeca'],'Zygomaticus minor muscle':['Zigomático menor','cabeca'],
  'Corrugator supercilii':['Corrugador do supercílio','cabeca'],'Depressor anguli oris':['Abaixador do ângulo da boca','cabeca'],'Depressor labii inferioris':['Abaixador do lábio inferior','cabeca'],
  'Levator anguli oris':['Levantador do ângulo da boca','cabeca'],'Procerus muscle':['Prócero','cabeca'],'Risorius muscle':['Risório','cabeca'],'Levator labii superioris':['Levantador do lábio superior','cabeca'],
  'Depressor septi nasi':['Abaixador do septo nasal','cabeca'],'Mentalis muscle':['Mentual','cabeca'],'Levator nasolabialis':['Levantador do lábio superior e da asa do nariz','cabeca'],'Bucinator':['Bucinador','cabeca'],
  'Superficial part of masseter':['Masseter (parte superficial)','cabeca'],'Deep part of masseter':['Masseter (parte profunda)','cabeca'],'Temporalis muscle':['Temporal','cabeca'],
  'Sternocleidomastoid muscle':['Esternocleidomastóideo','pescoco'],'Platysma':['Platisma','pescoco'],'Scalenus medius muscle':['Escaleno médio','pescoco'],'Scalenus posterior muscle':['Escaleno posterior','pescoco'],
  'Scalenus anterior muscle':['Escaleno anterior','pescoco'],'Longus capitis muscle':['Longo da cabeça','pescoco'],'Longus colli muscle':['Longo do pescoço','pescoco'],'Rectus anterior capitis muscle':['Reto anterior da cabeça','pescoco'],
  'Rectus lateralis capitis muscle':['Reto lateral da cabeça','pescoco'],'Mylohyoid muscle':['Milo-hióideo','pescoco'],'Stylohyoid muscle':['Estilo-hióideo','pescoco'],'Geniohyoid muscle':['Gênio-hióideo','pescoco'],
  'Intermediate tendon of digastric muscle':['Tendão intermédio do digástrico','pescoco'],'Anterior belly of digastric muscle':['Digástrico (ventre anterior)','pescoco'],'Posterior belly of digastric muscle':['Digástrico (ventre posterior)','pescoco'],
  'Omohyoid muscle':['Omo-hióideo','pescoco'],'Sternohyoid muscle':['Esterno-hióideo','pescoco'],'Sternothyroid muscle':['Esternotireóideo','pescoco'],'Thyrohyoid muscle':['Tíreo-hióideo','pescoco'],
  'Levator scapulae':['Levantador da escápula','trapezio'],'Rhomboid major muscle':['Romboide maior'],'Rhomboid minor muscle':['Romboide menor'],'Latissimus dorsi muscle':['Latíssimo do dorso (grande dorsal)'],
  'Serratus posterior inferior muscle':['Serrátil posterior inferior','costas'],'Serratus posterior superior muscle':['Serrátil posterior superior','costas'],
  'Ascending part of trapezius muscle':['Trapézio (parte ascendente/inferior)'],'Descending part of trapezius muscle':['Trapézio (parte descendente/superior)'],'Transverse part of trapezius muscle':['Trapézio (parte transversa/média)'],
  'Obliquus inferior capitis muscle':['Oblíquo inferior da cabeça','pescoco'],'Obliquus superior capitis muscle':['Oblíquo superior da cabeça','pescoco'],'Rectus posterior major capitis muscle':['Reto posterior maior da cabeça','pescoco'],'Rectus posterior minor capitis muscle':['Reto posterior menor da cabeça','pescoco'],
  'Splenius capitis muscle':['Esplênio da cabeça','pescoco'],'Splenius colli muscle':['Esplênio do pescoço','pescoco'],
  'Iliocostalis lumborum muscle':['Iliocostal do lombo'],'Iliocostalis thoracis muscle':['Iliocostal do tórax','lombar'],'Iliocostalis colli muscle':['Iliocostal do pescoço','pescoco'],
  'Longissimus thoracis muscle':['Longuíssimo do tórax'],'Longissimus capitis muscle':['Longuíssimo da cabeça','pescoco'],'Longissimus colli muscle':['Longuíssimo do pescoço','pescoco'],
  'Spinalis capitis muscle':['Espinal da cabeça','pescoco'],'Spinalis colli muscle':['Espinal do pescoço','pescoco'],'Spinalis thoracis muscle':['Espinal do tórax','lombar'],
  'Multifidus colli muscle':['Multífido do pescoço','pescoco'],'Multifidus thoracis muscle':['Multífido do tórax','lombar'],'Multifidus lumborum muscle':['Multífido do lombo'],
  'Semispinalis thoracis muscle':['Semiespinal do tórax','lombar'],'Semispinalis colli muscle':['Semiespinal do pescoço','pescoco'],
  'Pectoralis minor muscle':['Peitoral menor','peito'],'Serratus anterior muscle':['Serrátil anterior','torax'],'Subclavius muscle':['Subclávio','torax'],
  'Clavicular head of pectoralis major muscle':['Peitoral maior (porção clavicular)'],'Sternocostal head of pectoralis major muscle':['Peitoral maior (porção esternocostal)'],'Abdominal part of pectoralis major muscle':['Peitoral maior (porção abdominal)'],
  'Rectus abdominis muscle':['Reto do abdome'],'External abdominal oblique muscle':['Oblíquo externo do abdome'],'Internal abdominal oblique muscle':['Oblíquo interno do abdome'],'Linea alba':['Linha alba','abdomen'],
  'Pyramidalis muscle':['Piramidal'],'Quadratus lumborum muscle':['Quadrado do lombo'],
  'Teres major muscle':['Redondo maior'],'Acromial part of deltoid muscle':['Deltoide (parte acromial/lateral)'],'Clavicular part of deltoid muscle':['Deltoide (parte clavicular/anterior)'],'Scapular spinal part of deltoid muscle':['Deltoide (parte espinal/posterior)'],
  'Subscapularis muscle':['Subescapular','manguito'],'Supraspinatus muscle':['Supraespinal','manguito'],'Teres minor muscle':['Redondo menor'],'Infraspinatus muscle':['Infraespinal'],
  'Brachialis muscle':['Braquial'],'Coracobrachialis muscle':['Coracobraquial','biceps'],'Long head of biceps brachii':['Bíceps braquial (cabeça longa)'],'Short head of biceps brachii':['Bíceps braquial (cabeça curta)'],
  'Medial head of triceps brachii':['Tríceps braquial (cabeça medial)'],'Lateral head of triceps brachii':['Tríceps braquial (cabeça lateral)'],'Long head of triceps brachii':['Tríceps braquial (cabeça longa)'],
  'Superficial head of pronator teres':['Pronador redondo (cabeça umeral)'],'Deep head of pronator teres':['Pronador redondo (cabeça ulnar)'],
  'Humeral head of flexor carpi ulnaris':['Flexor ulnar do carpo (cabeça umeral)'],'Ulnar head of flexor carpi ulnaris':['Flexor ulnar do carpo (cabeça ulnar)'],
  'Humero-ulnar head of flexor digitorum superficialis':['Flexor superficial dos dedos (cabeça umeroulnar)'],'Radial head of flexor digitorum superficialis':['Flexor superficial dos dedos (cabeça radial)'],
  'Flexor carpi radialis':['Flexor radial do carpo'],'Palmaris longus muscle':['Palmar longo'],'Flexor digitorum profundus':['Flexor profundo dos dedos'],'Flexor pollicis longus':['Flexor longo do polegar'],'Pronator quadratus':['Pronador quadrado'],
  'Extensor digitorum':['Extensor dos dedos'],'Ulnar head of extensor carpi ulnaris':['Extensor ulnar do carpo (cabeça ulnar)'],'Humeral head of extensor carpi ulnaris':['Extensor ulnar do carpo (cabeça umeral)'],
  'Brachioradialis muscle':['Braquiorradial'],'Extensor carpi radialis longus':['Extensor radial longo do carpo'],'Extensor carpi radialis brevis':['Extensor radial curto do carpo'],'Anconeus muscle':['Ancôneo'],'Extensor digiti minimi':['Extensor do dedo mínimo'],
  'Supinator':['Supinador'],'Abductor pollicis longus':['Abdutor longo do polegar'],'Extensor indicis':['Extensor do indicador'],'Extensor pollicis brevis':['Extensor curto do polegar'],'Extensor pollicis longus':['Extensor longo do polegar'],
  'Superficial head of flexor pollicis brevis':['Flexor curto do polegar (cabeça superficial)','mao'],'Deep head of flexor pollicis brevis':['Flexor curto do polegar (cabeça profunda)','mao'],
  'Oblique head of adductor pollicis':['Adutor do polegar (cabeça oblíqua)','mao'],'Transverse head of adductor pollicis':['Adutor do polegar (cabeça transversa)','mao'],'Abductor pollicis brevis':['Abdutor curto do polegar','mao'],
  'Opponens pollicis muscle':['Oponente do polegar','mao'],'Abductor digiti minimi of hand':['Abdutor do dedo mínimo (mão)','mao'],'Flexor digiti minimi of hand':['Flexor curto do dedo mínimo (mão)','mao'],
  'Opponens digiti minimi muscle of hand':['Oponente do dedo mínimo','mao'],'Lumbrical muscles of hand':['Lumbricais da mão','mao'],'Dorsal interossei muscles of hand':['Interósseos dorsais da mão','mao'],'Palmar interossei muscles':['Interósseos palmares','mao'],
  'Rectus femoris muscle':['Reto femoral'],'Vastus lateralis muscle':['Vasto lateral'],'Vastus medialis muscle':['Vasto medial'],'Vastus intermedius muscle':['Vasto intermédio'],'Sartorius muscle':['Sartório','quadriceps'],
  'Long head of biceps femoris':['Bíceps femoral (cabeça longa)'],'Short head of biceps femoris':['Bíceps femoral (cabeça curta)'],'Semimembranosus muscle':['Semimembranáceo'],'Semitendinosus muscle':['Semitendíneo'],
  'Adductor magnus':['Adutor magno','adutores'],'Adductor minimus':['Adutor mínimo','adutores'],'Adductor longus':['Adutor longo','adutores'],'Pectineus muscle':['Pectíneo','adutores'],'Adductor brevis':['Adutor curto','adutores'],
  'Gracilis muscle':['Grácil','adutores'],'Obturator externus':['Obturador externo','quadril'],
  'Extensor digitorum longus':['Extensor longo dos dedos','perna'],'Tendon of extensor digitorum longus':['Tendão do extensor longo dos dedos','perna'],'Tibialis anterior muscle':['Tibial anterior','perna'],
  'Fibularis tertius muscle':['Fibular terceiro','perna'],'Extensor hallucis longus':['Extensor longo do hálux','perna'],'Fibularis longus muscle':['Fibular longo','perna'],'Fibularis brevis muscle':['Fibular curto','perna'],
  'Lateral head of gastrocnemius':['Gastrocnêmio (cabeça lateral)'],'Medial head of gastrocnemius':['Gastrocnêmio (cabeça medial)'],'Calcaneal tendon':['Tendão do calcâneo (de Aquiles)','panturrilhas'],
  'Soleus muscle':['Sóleo'],'Plantaris muscle':['Plantar','panturrilhas'],'Flexor digitorum longus':['Flexor longo dos dedos','perna'],'Popliteus muscle':['Poplíteo','perna'],'Tibialis posterior muscle':['Tibial posterior','perna'],'Flexor hallucis longus':['Flexor longo do hálux','perna'],
  'Abductor digiti minimi of foot':['Abdutor do dedo mínimo (pé)','pe'],'Abductor hallucis':['Abdutor do hálux','pe'],'Extensor digitorum brevis':['Extensor curto dos dedos','pe'],'Extensor hallucis brevis':['Extensor curto do hálux','pe'],
  'Dorsal interossei muscles of foot':['Interósseos dorsais do pé','pe'],'Flexor digitorum brevis':['Flexor curto dos dedos','pe'],'Flexor digiti minimi of foot':['Flexor curto do dedo mínimo (pé)','pe'],'Lumbrical muscles of foot':['Lumbricais do pé','pe'],
  'Opponens digiti minimi muscle of foot':['Oponente do dedo mínimo (pé)','pe'],'Plantar interossei muscles':['Interósseos plantares','pe'],'Quadratus plantae muscle':['Quadrado plantar','pe'],
  'Medial head of flexor hallucis brevis':['Flexor curto do hálux (cabeça medial)','pe'],'Lateral head of flexor hallucis brevis':['Flexor curto do hálux (cabeça lateral)','pe'],
  'Oblique head of adductor hallucis':['Adutor do hálux (cabeça oblíqua)','pe'],'Transverse head of adductor hallucis':['Adutor do hálux (cabeça transversa)','pe'],
  'Iliacus muscle':['Ilíaco','quadril'],'Psoas major':['Psoas maior','quadril'],'Gluteus medius muscle':['Glúteo médio'],'Gluteus maximus muscle':['Glúteo máximo'],'Gluteus minimus muscle':['Glúteo mínimo','gluteos'],
  'Piriformis muscle':['Piriforme','quadril'],'Quadratus femoris muscle':['Quadrado femoral','quadril'],'Inferior gemellus muscle':['Gêmeo inferior','quadril'],'Obturator internus':['Obturador interno','quadril'],'Superior gemellus muscle':['Gêmeo superior','quadril']
}
// "Latissimus dorsi muscle (r)" -> { base, side }
export function parseLabel(label) {
  const m = /^(.*?)\s*\((r|l)\)$/.exec(label || '')
  const raw = m ? m[1] : (label || '')
  return { base: raw.replace(/^\((.*)\)$/, '$1').trim(), side: m ? m[2] : null }
}
export const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
