import React, { useState, useEffect } from 'react';
import { 
  Shield, Swords, Scroll, Castle, Skull, Heart,
  User, Users, Play, Target, Sparkles, Trophy, LogOut, Plus, HelpCircle, Check, X
} from 'lucide-react';

// --- CONFIGURAÇÃO DO SEU FIREBASE ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, updateDoc, addDoc, deleteDoc, query, where, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBB1eD7H8ADJcben-Tj0Tecq8nFVSylYDg",
  authDomain: "noatas-3c8a0.firebaseapp.com",
  projectId: "noatas-3c8a0",
  storageBucket: "noatas-3c8a0.firebasestorage.app",
  messagingSenderId: "245916779117",
  appId: "1:245916779117:web:8bab27571f0e644fc37564"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CLASSES = [
  { id: 'guerreiro', name: 'Guerreiro', color: 'bg-red-600', icon: '⚔️' },
  { id: 'mago', name: 'Mago', color: 'bg-purple-600', icon: '🔮' },
  { id: 'ladino', name: 'Ladino', color: 'bg-stone-600', icon: '🗡️' },
  { id: 'clerigo', name: 'Clérigo', color: 'bg-emerald-500', icon: '✨' },
  { id: 'paladino', name: 'Paladino', color: 'bg-yellow-500', icon: '🛡️' }
];

const MAX_HP = 3;

export default function FunctionalRpgGame() {
  const [user, setUser] = useState(null);
  
  // DADOS PERMANENTES
  const [profile, setProfile] = useState(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfile, setNewProfile] = useState({ name: '', classId: 'guerreiro' });

  // DADOS DA PARTIDA
  const [activeRooms, setActiveRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [loading, setLoading] = useState(true);

  // ESTADOS TEMPORÁRIOS DO COMBATE (Para os inputs de texto)
  const [battleInput, setBattleInput] = useState({ question: '', answer: '', guess: '' });

  // 1. Inicializa Autenticação
  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } 
      catch (err) { console.warn("Erro Auth", err); }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return () => unsub();
  }, []);

  // 2. Carrega Perfil Permanente e Escuta Salas Abertas
  useEffect(() => {
    if (!user) return;
    const unsubProfile = onSnapshot(doc(db, 'rpg_users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data());
        setIsCreatingProfile(false);
      } else {
        setIsCreatingProfile(true);
      }
      setLoading(false);
    });

    const q = query(collection(db, 'rpg_rooms'), where('status', '==', 'waiting'));
    const unsubRooms = onSnapshot(q, (snapshot) => {
      const rooms = [];
      snapshot.forEach(d => rooms.push({ id: d.id, ...d.data() }));
      setActiveRooms(rooms);
    });

    return () => { unsubProfile(); unsubRooms(); };
  }, [user]);

  // 3. Escuta a Sala Atual
  useEffect(() => {
    if (!currentRoom?.id) return;
    const unsubRoom = onSnapshot(doc(db, 'rpg_rooms', currentRoom.id), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentRoom({ id: docSnap.id, ...docSnap.data() });
      } else {
        setCurrentRoom(null); // Sala destruída
      }
    });
    return () => unsubRoom();
  }, [currentRoom?.id]);

  // --- AÇÕES DO LOBBY ---

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    if (!user || !newProfile.name) return;
    await setDoc(doc(db, 'rpg_users', user.uid), {
      name: newProfile.name,
      classId: newProfile.classId,
      wins: 0,
      matchesPlayed: 0
    });
  };

  const createRoom = async () => {
    const roomRef = await addDoc(collection(db, 'rpg_rooms'), {
      hostId: user.uid,
      hostName: profile.name,
      status: 'waiting', 
      players: [{ uid: user.uid, name: profile.name, classId: profile.classId, team: 'A' }]
    });
    setCurrentRoom({ id: roomRef.id, status: 'waiting' });
  };

  const joinRoom = async (roomId) => {
    const roomToJoin = activeRooms.find(r => r.id === roomId);
    if (!roomToJoin) return;
    
    // Divide quem entra: Se a Equipa A tiver mais jogadores, vai para a B, e vice-versa
    const teamACount = roomToJoin.players.filter(p => p.team === 'A').length;
    const teamBCount = roomToJoin.players.filter(p => p.team === 'B').length;
    const assignedTeam = teamACount > teamBCount ? 'B' : 'A';

    const newPlayers = [...roomToJoin.players, { uid: user.uid, name: profile.name, classId: profile.classId, team: assignedTeam }];
    await updateDoc(doc(db, 'rpg_rooms', roomId), { players: newPlayers });
    setCurrentRoom({ id: roomId, status: 'waiting' });
  };

  const leaveRoom = async () => {
    if (currentRoom.hostId === user.uid && currentRoom.status === 'waiting') {
      await deleteDoc(doc(db, 'rpg_rooms', currentRoom.id)); 
    } else {
      const newPlayers = currentRoom.players.filter(p => p.uid !== user.uid);
      await updateDoc(doc(db, 'rpg_rooms', currentRoom.id), { players: newPlayers });
    }
    setCurrentRoom(null);
  };

  const startGame = async () => {
    await updateDoc(doc(db, 'rpg_rooms', currentRoom.id), { 
      status: 'playing',
      hpA: MAX_HP,
      hpB: MAX_HP,
      turn: 'A', // Começa com a Equipa A a atacar
      battlePhase: 'ask', // Fases: ask (perguntar), answer (responder), judge (avaliar)
      currentQuestion: '',
      currentAnswer: '',
      currentGuess: ''
    });
  };

  // --- AÇÕES DE COMBATE ---

  // 1. Equipa Atacante envia a Pergunta e a Resposta Certa
  const submitQuestion = async (e) => {
    e.preventDefault();
    if (!battleInput.question || !battleInput.answer) return;
    await updateDoc(doc(db, 'rpg_rooms', currentRoom.id), {
      currentQuestion: battleInput.question,
      currentAnswer: battleInput.answer,
      battlePhase: 'answer'
    });
    setBattleInput({ ...battleInput, question: '', answer: '' });
  };

  // 2. Equipa Defensora envia o seu Palpite
  const submitGuess = async (e) => {
    e.preventDefault();
    if (!battleInput.guess) return;
    await updateDoc(doc(db, 'rpg_rooms', currentRoom.id), {
      currentGuess: battleInput.guess,
      battlePhase: 'judge'
    });
    setBattleInput({ ...battleInput, guess: '' });
  };

  // 3. Equipa Atacante julga a resposta (Acertou ou Errou)
  const judgeAnswer = async (isCorrect) => {
    const isTeamA = currentRoom.turn === 'A';
    let newHpA = currentRoom.hpA;
    let newHpB = currentRoom.hpB;

    // Se a defesa errou, perde vida
    if (!isCorrect) {
      if (isTeamA) newHpB -= 1;
      else newHpA -= 1;
    }

    // Verifica se alguém morreu
    if (newHpA <= 0 || newHpB <= 0) {
      const winner = newHpA > 0 ? 'A' : 'B';
      await updateDoc(doc(db, 'rpg_rooms', currentRoom.id), { 
        status: 'finished', 
        winner: winner,
        hpA: newHpA,
        hpB: newHpB
      });
      
      // Atualiza vitórias no perfil
      currentRoom.players.forEach(async (p) => {
        const pIsWinner = p.team === winner;
        const userRef = doc(db, 'rpg_users', p.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          await updateDoc(userRef, { 
            matchesPlayed: (data.matchesPlayed || 0) + 1,
            wins: pIsWinner ? (data.wins || 0) + 1 : (data.wins || 0)
          });
        }
      });
    } else {
      // Combate continua, troca o turno
      await updateDoc(doc(db, 'rpg_rooms', currentRoom.id), {
        hpA: newHpA,
        hpB: newHpB,
        turn: isTeamA ? 'B' : 'A',
        battlePhase: 'ask',
        currentQuestion: '',
        currentAnswer: '',
        currentGuess: ''
      });
    }
  };


  // --- COMPONENTES DE UI ---

  const HealthBar = ({ hp }) => (
    <div className="flex gap-1 justify-center my-2">
      {[...Array(MAX_HP)].map((_, i) => (
        <Heart key={i} className={`w-8 h-8 transition-all ${i < hp ? 'fill-red-500 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] scale-110' : 'fill-stone-800 text-stone-700'}`} />
      ))}
    </div>
  );

  if (loading) return <div className="min-h-screen bg-stone-950 flex items-center justify-center text-amber-500 font-serif text-2xl animate-pulse">Carregando os Pergaminhos...</div>;

  // TELA 1: CRIAÇÃO DE PERFIL
  if (isCreatingProfile) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4 font-serif text-stone-200 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-stone-900 to-stone-950">
        <form onSubmit={handleCreateProfile} className="max-w-md w-full bg-stone-900 border-2 border-stone-700 p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-700 via-yellow-500 to-amber-700"></div>
          <Scroll className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-3xl font-black text-amber-500 text-center mb-6 uppercase tracking-widest">Forjar Herói</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-amber-600 text-sm font-bold mb-2 uppercase tracking-wider">Como serás conhecido?</label>
              <input required type="text" value={newProfile.name} onChange={e => setNewProfile({...newProfile, name: e.target.value})} className="w-full bg-stone-950 border-2 border-stone-700 p-4 outline-none focus:border-amber-500 text-amber-100 font-bold rounded-lg text-lg text-center" placeholder="Ex: Arthur" />
            </div>
            <div>
              <label className="block text-amber-600 text-sm font-bold mb-2 uppercase tracking-wider">Escolhe o teu caminho</label>
              <div className="grid grid-cols-3 gap-3">
                {CLASSES.map(c => (
                  <button key={c.id} type="button" onClick={() => setNewProfile({...newProfile, classId: c.id})} className={`p-4 border-2 rounded-lg flex flex-col items-center gap-2 transition-all ${newProfile.classId === c.id ? 'border-amber-500 bg-stone-800 scale-105 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-stone-700 bg-stone-950 hover:border-stone-600 hover:bg-stone-900'}`}>
                    <span className="text-3xl">{c.icon}</span>
                    <span className="text-xs font-bold text-stone-300 uppercase tracking-wider">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="w-full bg-amber-700 hover:bg-amber-600 text-stone-100 font-black py-5 mt-4 uppercase tracking-widest rounded-lg transition-colors shadow-lg shadow-amber-900/50 flex items-center justify-center gap-2">
              <Swords className="w-5 h-5"/> Iniciar Jornada
            </button>
          </div>
        </form>
      </div>
    );
  }

  // TELA 2: LOBBY DE SALAS
  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-stone-950 font-serif text-stone-200 p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header do Jogador */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 mb-8 flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl relative overflow-hidden">
            <div className="absolute -right-10 -top-10 opacity-5">
               <Shield className="w-64 h-64" />
            </div>
            <div className="flex items-center gap-6 z-10">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg border-4 border-stone-800 ${CLASSES.find(c => c.id === profile.classId)?.color}`}>
                {CLASSES.find(c => c.id === profile.classId)?.icon}
              </div>
              <div>
                <h1 className="text-4xl font-black text-amber-500">{profile.name}</h1>
                <p className="text-stone-400 font-bold uppercase text-sm tracking-widest bg-stone-950 inline-block px-3 py-1 rounded-full mt-2 border border-stone-800">{CLASSES.find(c => c.id === profile.classId)?.name}</p>
              </div>
            </div>
            <div className="flex gap-8 text-center bg-stone-950 p-4 rounded-xl border border-stone-800 z-10">
              <div><p className="text-stone-500 text-xs uppercase font-bold tracking-widest mb-1">Vitórias</p><p className="text-3xl font-black text-emerald-500 flex items-center justify-center gap-2"><Trophy className="w-6 h-6"/> {profile.wins || 0}</p></div>
              <div className="w-px bg-stone-800"></div>
              <div><p className="text-stone-500 text-xs uppercase font-bold tracking-widest mb-1">Batalhas</p><p className="text-3xl font-black text-stone-300">{profile.matchesPlayed || 0}</p></div>
            </div>
          </div>

          {/* Área de Salas */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <h2 className="text-3xl font-black text-stone-300 flex items-center gap-3 uppercase tracking-widest"><Castle className="w-8 h-8 text-amber-600"/> Campos de Batalha</h2>
            <button onClick={createRoom} className="w-full sm:w-auto bg-amber-700 hover:bg-amber-600 text-stone-100 font-black px-8 py-4 flex items-center justify-center gap-2 rounded-xl shadow-[0_0_20px_rgba(217,119,6,0.2)] transition-all hover:scale-105 uppercase tracking-wider">
              <Plus className="w-5 h-5"/> Criar Batalha
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeRooms.length === 0 ? (
              <div className="col-span-full p-16 text-center border-2 border-dashed border-stone-800 bg-stone-900/30 rounded-2xl">
                <Skull className="w-16 h-16 text-stone-700 mx-auto mb-4" />
                <p className="text-stone-500 text-lg font-bold">A arena está silenciosa... Crie uma batalha para os seus alunos!</p>
              </div>
            ) : (
              activeRooms.map(room => (
                <div key={room.id} className="bg-stone-900 border-2 border-stone-800 p-6 flex flex-col justify-between hover:border-amber-500 transition-colors rounded-2xl group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-2 h-full bg-amber-600"></div>
                  <div className="pl-4 mb-6">
                    <h3 className="font-black text-stone-200 text-xl mb-1 truncate">Arena de {room.hostName}</h3>
                    <p className="text-stone-400 text-sm flex items-center gap-2 font-bold uppercase tracking-wider"><Users className="w-4 h-4 text-amber-500"/> {room.players?.length || 1} Guerreiros</p>
                  </div>
                  <button onClick={() => joinRoom(room.id)} className="w-full bg-stone-800 hover:bg-amber-700 text-amber-500 hover:text-white border border-stone-700 hover:border-amber-600 py-3 font-black uppercase text-sm rounded-lg transition-all flex justify-center items-center gap-2">
                    <Swords className="w-4 h-4"/> Entrar no Combate
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // TELA 3: DENTRO DA SALA (SALA DE ESPERA OU BATALHA)
  const isHost = currentRoom.hostId === user.uid;
  const myTeam = currentRoom.players?.find(p => p.uid === user.uid)?.team;
  const teamA = currentRoom.players?.filter(p => p.team === 'A') || [];
  const teamB = currentRoom.players?.filter(p => p.team === 'B') || [];

  return (
    <div className="min-h-screen bg-stone-950 font-serif flex flex-col p-4 md:p-8">
      
      {/* Botão Sair do Topo */}
      <div className="max-w-7xl w-full mx-auto mb-6 flex justify-between items-center">
        <button onClick={leaveRoom} className="text-stone-500 hover:text-red-400 flex items-center gap-2 font-bold text-sm uppercase tracking-widest transition-colors bg-stone-900 px-4 py-2 rounded-lg border border-stone-800">
          <LogOut className="w-4 h-4"/> Fugir da Batalha
        </button>
        {currentRoom.status !== 'waiting' && (
           <div className="bg-stone-900 border border-stone-700 px-6 py-2 rounded-full font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
             <Target className="w-5 h-5"/> Turno da Equipa {currentRoom.turn}
           </div>
        )}
      </div>

      <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full">
        
        {/* CABEÇALHO DO ESTADO DO JOGO */}
        {currentRoom.status === 'playing' && (
           <div className="text-center mb-8 animate-in fade-in zoom-in duration-500">
             <h2 className="text-3xl md:text-5xl font-black text-red-500 uppercase tracking-widest mb-2 drop-shadow-[0_0_15px_rgba(239,68,68,0.3)]">Combate Mortal!</h2>
           </div>
        )}

        {currentRoom.status === 'finished' && (
          <div className="text-center mb-8 animate-in slide-in-from-top-8 duration-500">
            <Trophy className="w-24 h-24 text-yellow-500 mx-auto mb-4 drop-shadow-[0_0_40px_rgba(234,179,8,0.6)] animate-bounce" />
            <h2 className="text-5xl md:text-7xl font-black text-yellow-500 uppercase tracking-widest mb-4">A Equipa {currentRoom.winner} Venceu!</h2>
            <p className="text-stone-300 text-xl font-bold">Glória eterna foi adicionada aos perfis dos vencedores.</p>
          </div>
        )}

        {/* AS DUAS EQUIPAS E VIDAS */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-12 justify-center items-stretch mb-12">
          
          {/* Lado Equipa A */}
          <div className={`flex-1 bg-stone-900/60 border-4 rounded-2xl p-6 transition-all relative overflow-hidden
            ${currentRoom.status === 'playing' && currentRoom.turn === 'A' ? 'border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.2)]' : 'border-stone-800'}
            ${currentRoom.status === 'finished' && currentRoom.winner === 'A' ? 'border-yellow-400 bg-yellow-900/20' : ''}
          `}>
            {currentRoom.status === 'playing' && currentRoom.turn === 'A' && <div className="absolute top-0 left-0 w-full h-1 bg-amber-500 animate-pulse"></div>}
            
            <h3 className="text-center font-black text-blue-500 uppercase tracking-widest text-2xl mb-2">A Ordem Azul (Eq. A)</h3>
            {currentRoom.status !== 'waiting' && <HealthBar hp={currentRoom.hpA} />}
            
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              {teamA.map(p => (
                <div key={p.uid} className="flex flex-col items-center bg-stone-950 p-3 rounded-xl border border-stone-800 min-w-[100px]">
                   <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-2 shadow-lg ${CLASSES.find(c => c.id === p.classId)?.color}`}>{CLASSES.find(c => c.id === p.classId)?.icon}</div>
                   <p className="font-bold text-stone-200 text-center text-sm truncate w-full">{p.name}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <Swords className="w-16 h-16 text-stone-700" />
          </div>

          {/* Lado Equipa B */}
          <div className={`flex-1 bg-stone-900/60 border-4 rounded-2xl p-6 transition-all relative overflow-hidden
            ${currentRoom.status === 'playing' && currentRoom.turn === 'B' ? 'border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.2)]' : 'border-stone-800'}
            ${currentRoom.status === 'finished' && currentRoom.winner === 'B' ? 'border-yellow-400 bg-yellow-900/20' : ''}
          `}>
            {currentRoom.status === 'playing' && currentRoom.turn === 'B' && <div className="absolute top-0 left-0 w-full h-1 bg-amber-500 animate-pulse"></div>}
            
            <h3 className="text-center font-black text-red-500 uppercase tracking-widest text-2xl mb-2">A Fúria Rubra (Eq. B)</h3>
            {currentRoom.status !== 'waiting' && <HealthBar hp={currentRoom.hpB} />}
            
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              {teamB.length === 0 ? (
                <div className="w-full h-24 flex items-center justify-center border-2 border-dashed border-stone-700 text-stone-500 rounded-xl font-bold uppercase tracking-wider">Aguardando...</div>
              ) : (
                teamB.map(p => (
                  <div key={p.uid} className="flex flex-col items-center bg-stone-950 p-3 rounded-xl border border-stone-800 min-w-[100px]">
                     <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-2 shadow-lg ${CLASSES.find(c => c.id === p.classId)?.color}`}>{CLASSES.find(c => c.id === p.classId)?.icon}</div>
                     <p className="font-bold text-stone-200 text-center text-sm truncate w-full">{p.name}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* --- CONTROLES DE JOGO --- */}
        
        {/* Se for o Host e o jogo não começou */}
        {isHost && currentRoom.status === 'waiting' && teamB.length > 0 && (
          <div className="text-center animate-in slide-in-from-bottom-4">
            <button onClick={startGame} className="px-12 py-6 bg-red-700 hover:bg-red-600 text-white font-black text-3xl uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_40px_rgba(185,28,28,0.5)] hover:scale-105 hover:-translate-y-2 border-4 border-red-900 flex items-center gap-4 mx-auto">
              <Play className="w-8 h-8 fill-white"/> Iniciar Batalha Mortal
            </button>
            <p className="mt-4 text-stone-400 font-bold">Preparem os vossos conhecimentos.</p>
          </div>
        )}

        {/* --- MECÂNICA DE COMBATE (TURNOS) --- */}
        {currentRoom.status === 'playing' && (
          <div className="bg-stone-900 border-2 border-stone-700 rounded-3xl p-8 max-w-4xl w-full mx-auto shadow-2xl relative">
            
            {/* 1. FASE DE PERGUNTAR (Ataque) */}
            {currentRoom.battlePhase === 'ask' && (
              myTeam === currentRoom.turn ? (
                // O meu turno: Eu ataco!
                <form onSubmit={submitQuestion} className="space-y-6 animate-in fade-in zoom-in">
                  <div className="flex items-center gap-3 mb-6">
                    <Swords className="w-10 h-10 text-amber-500" />
                    <h3 className="text-3xl font-black text-white uppercase tracking-widest">Preparar Feitiço de Ataque</h3>
                  </div>
                  <p className="text-stone-400 mb-6">O primeiro da vossa equipa a preencher isto lança o ataque. Combinem em voz alta!</p>
                  
                  <div>
                    <label className="block text-amber-500 font-bold uppercase tracking-wider mb-2">Pergunta para o Oponente</label>
                    <textarea required value={battleInput.question} onChange={e => setBattleInput({...battleInput, question: e.target.value})} className="w-full bg-stone-950 border-2 border-stone-700 p-4 rounded-xl text-white outline-none focus:border-amber-500 resize-none h-24" placeholder="Qual é o maior planeta do sistema solar?" />
                  </div>
                  <div>
                    <label className="block text-emerald-500 font-bold uppercase tracking-wider mb-2">A Resposta Certa (Secreta)</label>
                    <input required type="text" value={battleInput.answer} onChange={e => setBattleInput({...battleInput, answer: e.target.value})} className="w-full bg-stone-950 border-2 border-stone-700 p-4 rounded-xl text-white outline-none focus:border-emerald-500" placeholder="Júpiter" />
                  </div>
                  <button type="submit" className="w-full py-5 bg-amber-700 hover:bg-amber-600 text-white font-black text-2xl uppercase tracking-widest rounded-xl transition-all shadow-lg flex justify-center items-center gap-3">
                     Lançar Pergunta! <Sparkles className="w-6 h-6"/>
                  </button>
                </form>
              ) : (
                // Turno do Inimigo: Aguardar
                <div className="text-center py-12 animate-pulse">
                  <Shield className="w-20 h-20 text-stone-600 mx-auto mb-6" />
                  <h3 className="text-3xl font-black text-stone-400 uppercase tracking-widest">Aguardem...</h3>
                  <p className="text-stone-500 mt-2 text-xl">A equipa inimiga está a formular um ataque.</p>
                </div>
              )
            )}

            {/* 2. FASE DE RESPONDER (Defesa) */}
            {currentRoom.battlePhase === 'answer' && (
              myTeam !== currentRoom.turn ? (
                // Fui atacado: Tenho de responder!
                <form onSubmit={submitGuess} className="space-y-8 animate-in slide-in-from-right-8">
                  <div className="bg-red-950/30 border-2 border-red-900/50 p-8 rounded-2xl text-center shadow-[inset_0_0_50px_rgba(153,27,27,0.2)]">
                    <h4 className="text-red-500 font-bold uppercase tracking-widest text-sm mb-4">Ataque Inimigo Recebido:</h4>
                    <p className="text-4xl md:text-5xl font-black text-white leading-tight">"{currentRoom.currentQuestion}"</p>
                  </div>
                  
                  <div>
                    <label className="block text-blue-400 font-bold uppercase tracking-wider mb-3 text-center">Rápido! Qual é a vossa defesa?</label>
                    <input required type="text" value={battleInput.guess} onChange={e => setBattleInput({...battleInput, guess: e.target.value})} className="w-full bg-stone-950 border-2 border-blue-900 p-6 rounded-2xl text-white outline-none focus:border-blue-500 text-center text-2xl font-bold" placeholder="Digite a resposta aqui..." />
                  </div>
                  <button type="submit" className="w-full py-5 bg-blue-700 hover:bg-blue-600 text-white font-black text-2xl uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(29,78,216,0.4)] flex justify-center items-center gap-3">
                     Levantar Escudo! (Responder) <Shield className="w-6 h-6"/>
                  </button>
                </form>
              ) : (
                // Eu ataquei: Aguardar a resposta deles
                <div className="text-center py-12">
                  <h4 className="text-amber-500 font-bold uppercase tracking-widest text-sm mb-4">O seu ataque:</h4>
                  <p className="text-3xl font-black text-white mb-8">"{currentRoom.currentQuestion}"</p>
                  <p className="text-stone-500 text-xl animate-pulse">A aguardar que a equipa inimiga responda...</p>
                </div>
              )
            )}

            {/* 3. FASE DE JULGAMENTO (O Mestre da Vez) */}
            {currentRoom.battlePhase === 'judge' && (
              myTeam === currentRoom.turn ? (
                // Sou o atacante: Julgar se a resposta deles serve!
                <div className="space-y-8 animate-in zoom-in-95">
                  <div className="text-center mb-8">
                    <h3 className="text-3xl font-black text-amber-500 uppercase tracking-widest mb-2">Julgamento</h3>
                    <p className="text-stone-400">Eles responderam. Cabe-vos a vós decidir se a resposta é aceitável!</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-emerald-950/30 border-2 border-emerald-900/50 p-6 rounded-2xl text-center">
                      <span className="block text-emerald-500 font-bold uppercase text-xs tracking-widest mb-2">A Vossa Resposta Secreta:</span>
                      <p className="text-2xl font-black text-white">{currentRoom.currentAnswer}</p>
                    </div>
                    <div className="bg-blue-950/30 border-2 border-blue-900/50 p-6 rounded-2xl text-center">
                      <span className="block text-blue-400 font-bold uppercase text-xs tracking-widest mb-2">O que o Inimigo Respondeu:</span>
                      <p className="text-2xl font-black text-white">{currentRoom.currentGuess}</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-stone-800">
                    <button onClick={() => judgeAnswer(true)} className="flex-1 py-5 bg-stone-800 hover:bg-emerald-900 text-emerald-400 font-black uppercase tracking-widest rounded-xl transition-all border border-stone-700 hover:border-emerald-500 flex justify-center items-center gap-2">
                       <Check className="w-6 h-6"/> Aceitar Defesa (Não sofrem dano)
                    </button>
                    <button onClick={() => judgeAnswer(false)} className="flex-1 py-5 bg-stone-800 hover:bg-red-900 text-red-500 font-black uppercase tracking-widest rounded-xl transition-all border border-stone-700 hover:border-red-500 flex justify-center items-center gap-2">
                       <X className="w-6 h-6"/> Recusar (Causar -1 Vida)
                    </button>
                  </div>
                </div>
              ) : (
                // Sou a defesa: Esperar o veredito
                <div className="text-center py-12">
                  <h3 className="text-4xl font-black text-white mb-6">O Veredito...</h3>
                  <div className="bg-stone-900 inline-block p-6 rounded-2xl border border-stone-800 mb-6 shadow-xl">
                    <span className="block text-stone-500 font-bold uppercase text-xs tracking-widest mb-2">Vossa Resposta:</span>
                    <p className="text-2xl font-black text-blue-400">{currentRoom.currentGuess}</p>
                  </div>
                  <p className="text-stone-400 text-xl animate-pulse">A equipa inimiga está a decidir se aceita a vossa resposta!</p>
                </div>
              )
            )}

          </div>
        )}

      </div>
    </div>
  );
}
