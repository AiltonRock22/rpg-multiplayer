import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Shield, Swords, Scroll, Castle, Skull, Heart,
  User, Users, Play, Target, Sparkles, Trophy, LogOut, 
  Plus, HelpCircle, Check, X, Loader2, UserPlus, AlertCircle
} from 'lucide-react';

// --- CONFIGURAÇÃO DO FIREBASE (PROJETO: rpg-ailtonrock22) ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  getDoc,
  serverTimestamp,
  enableNetwork,
  disableNetwork,
  waitForPendingWrites
} from 'firebase/firestore';

// Configuração do Firebase (SUBSTITUA PELO CONFIG REAL DO CONSOLE)
const firebaseConfig = {
  apiKey: "AIzaSyDYtWqNc0xAqo6s-3ABv7WoErZQZYWZuIE",
  authDomain: "rpg-ailtonrock22.firebaseapp.com",
  projectId: "rpg-ailtonrock22",
  storageBucket: "rpg-ailtonrock22.appspot.com",
  messagingSenderId: "107875485976188576408",
  appId: "1:107875485976188576408:web:8bab27571f0e644fc37564" // VERIFIQUE NO CONSOLE!
};

// Inicialização do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Constantes do jogo
const CLASSES = [
  { id: 'guerreiro', name: 'Guerreiro', color: 'bg-red-600', icon: '⚔️', description: 'Mestre das armas' },
  { id: 'mago', name: 'Mago', color: 'bg-purple-600', icon: '🔮', description: 'Arcano poderoso' },
  { id: 'ladino', name: 'Ladino', color: 'bg-stone-600', icon: '🗡️', description: 'Ágil e furtivo' },
  { id: 'clerigo', name: 'Clérigo', color: 'bg-emerald-500', icon: '✨', description: 'Curandeiro sagrado' },
  { id: 'paladino', name: 'Paladino', color: 'bg-yellow-500', icon: '🛡️', description: 'Defensor da luz' }
];

const MAX_HP = 3;
const GAME_VERSION = "Alpha-2.0";
const PROCESSING_DELAY = 400; // ms para evitar cliques múltiplos

// Frases de carregamento
const LOADING_PHRASES = [
  "Desenrolando pergaminhos ancestrais...",
  "Verificando conhecimentos milenares...",
  "Convocando os espíritos da sabedoria...",
  "Afiando espadas e polindo escudos...",
  "Consultando os oráculos antigos...",
  "Preparando a arena de batalha...",
  "Sussurrando magias de conexão...",
  "Invocando heróis de outros reinos..."
];

// Componente principal
export default function FunctionalRpgGame() {
  // Estados de autenticação
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  
  // Estados do perfil
  const [profile, setProfile] = useState(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfile, setNewProfile] = useState({ name: '', classId: 'guerreiro' });
  
  // Estados das salas
  const [activeRooms, setActiveRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  
  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [loadingPhrase, setLoadingPhrase] = useState(LOADING_PHRASES[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Estados do combate
  const [battleInput, setBattleInput] = useState({ question: '', answer: '', guess: '' });
  
  // Refs para controle
  const processingTimeout = useRef(null);
  const errorTimeout = useRef(null);

  // Limpar timeouts ao desmontar
  useEffect(() => {
    return () => {
      if (processingTimeout.current) clearTimeout(processingTimeout.current);
      if (errorTimeout.current) clearTimeout(errorTimeout.current);
    };
  }, []);

  // Mostrar mensagens temporárias
  const showMessage = useCallback((type, message) => {
    if (type === 'error') setError(message);
    else setSuccess(message);
    
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 5000);
  }, []);

  // Liberar processamento após delay
  const releaseProcessing = useCallback(() => {
    if (processingTimeout.current) clearTimeout(processingTimeout.current);
    processingTimeout.current = setTimeout(() => {
      setIsProcessing(false);
    }, PROCESSING_DELAY);
  }, []);

  // 1. Autenticação anônima
  useEffect(() => {
    const initAuth = async () => {
      try {
        setLoading(true);
        await signInAnonymously(auth);
        console.log('✅ Autenticação anônima realizada');
      } catch (err) {
        console.error('❌ Erro na autenticação:', err);
        setAuthError(err.message);
        showMessage('error', 'Falha na autenticação. Recarregue a página.');
      }
    };
    
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('👤 Estado da autenticação mudou:', user?.uid || 'null');
      setUser(user);
      if (!user) {
        setLoading(true);
        setProfile(null);
        setCurrentRoom(null);
      }
    });
    
    return () => unsubscribe();
  }, [showMessage]);

  // 2. Carregar perfil e escutar salas
  useEffect(() => {
    if (!user) return;
    
    console.log('📂 Carregando perfil do usuário:', user.uid);
    
    // Listener do perfil
    const profileRef = doc(db, 'rpg_users', user.uid);
    const unsubscribeProfile = onSnapshot(profileRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const profileData = docSnap.data();
          console.log('✅ Perfil carregado:', profileData.name);
          setProfile(profileData);
          setIsCreatingProfile(false);
        } else {
          console.log('📝 Perfil não encontrado, mostrando criação');
          setIsCreatingProfile(true);
          setProfile(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('❌ Erro ao carregar perfil:', error);
        showMessage('error', 'Erro ao carregar perfil. Tente recarregar.');
        setLoading(false);
      }
    );

    // Listener das salas ativas
    const roomsQuery = query(
      collection(db, 'rpg_rooms'),
      where('status', '==', 'waiting')
    );
    
    const unsubscribeRooms = onSnapshot(roomsQuery,
      (snapshot) => {
        const rooms = [];
        snapshot.forEach((doc) => {
          rooms.push({ id: doc.id, ...doc.data() });
        });
        console.log(`🏰 ${rooms.length} salas ativas encontradas`);
        setActiveRooms(rooms);
      },
      (error) => {
        console.error('❌ Erro ao carregar salas:', error);
        showMessage('error', 'Erro ao carregar salas.');
      }
    );

    return () => {
      unsubscribeProfile();
      unsubscribeRooms();
    };
  }, [user, showMessage]);

  // 3. Escutar sala atual
  useEffect(() => {
    if (!currentRoom?.id) return;
    
    console.log('👂 Escutando sala:', currentRoom.id);
    
    const roomRef = doc(db, 'rpg_rooms', currentRoom.id);
    const unsubscribeRoom = onSnapshot(roomRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const roomData = { id: docSnap.id, ...docSnap.data() };
          console.log('📡 Atualização da sala:', roomData.status, roomData.battlePhase);
          setCurrentRoom(roomData);
        } else {
          console.log('🗑️ Sala removida');
          setCurrentRoom(null);
          showMessage('error', 'A sala foi fechada pelo host.');
        }
      },
      (error) => {
        console.error('❌ Erro no listener da sala:', error);
        showMessage('error', 'Erro de conexão com a sala.');
      }
    );

    return () => {
      console.log('🔌 Parando de escutar sala:', currentRoom.id);
      unsubscribeRoom();
    };
  }, [currentRoom?.id, showMessage]);

  // 4. Animação das frases de carregamento
  useEffect(() => {
    if (!loading) return;
    
    const interval = setInterval(() => {
      setLoadingPhrase(prev => {
        const currentIndex = LOADING_PHRASES.indexOf(prev);
        const nextIndex = (currentIndex + 1) % LOADING_PHRASES.length;
        return LOADING_PHRASES[nextIndex];
      });
    }, 2500);
    
    return () => clearInterval(interval);
  }, [loading]);

  // --- AÇÕES DO PERFIL ---
  
  const handleCreateProfile = async (e) => {
    e.preventDefault();
    if (!user || !newProfile.name.trim() || isProcessing) return;
    
    setIsProcessing(true);
    console.log('🎭 Criando perfil:', newProfile.name);
    
    try {
      const profileData = {
        name: newProfile.name.trim(),
        classId: newProfile.classId,
        wins: 0,
        matchesPlayed: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(doc(db, 'rpg_users', user.uid), profileData);
      console.log('✅ Perfil criado com sucesso');
      showMessage('success', 'Perfil criado! Bem-vindo, herói!');
    } catch (err) {
      console.error('❌ Erro ao criar perfil:', err);
      showMessage('error', 'Erro ao criar perfil. Tente novamente.');
    } finally {
      releaseProcessing();
    }
  };

  // --- AÇÕES DAS SALAS ---

  const createRoom = async () => {
    if (isProcessing || !profile) return;
    
    setIsProcessing(true);
    console.log('🏰 Criando nova sala...');
    
    try {
      const roomData = {
        hostId: user.uid,
        hostName: profile.name,
        status: 'waiting',
        players: [{
          uid: user.uid,
          name: profile.name,
          classId: profile.classId,
          team: 'A'
        }],
        hpA: MAX_HP,
        hpB: MAX_HP,
        turn: 'A',
        battlePhase: 'idle',
        currentQuestion: '',
        currentAnswer: '',
        currentGuess: '',
        winner: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'rpg_rooms'), roomData);
      console.log('✅ Sala criada:', docRef.id);
      
      setCurrentRoom({ id: docRef.id, ...roomData });
      showMessage('success', 'Sala de batalha criada!');
    } catch (err) {
      console.error('❌ Erro ao criar sala:', err);
      showMessage('error', 'Erro ao criar sala. Verifique sua conexão.');
    } finally {
      releaseProcessing();
    }
  };

  const joinRoom = async (roomId) => {
    if (isProcessing || !profile) return;
    
    setIsProcessing(true);
    console.log('🚪 Entrando na sala:', roomId);
    
    try {
      const roomToJoin = activeRooms.find(r => r.id === roomId);
      if (!roomToJoin) {
        showMessage('error', 'Sala não encontrada.');
        return;
      }
      
      const isAlreadyInRoom = roomToJoin.players.some(p => p.uid === user.uid);
      
      if (!isAlreadyInRoom) {
        const teamACount = roomToJoin.players.filter(p => p.team === 'A').length;
        const teamBCount = roomToJoin.players.filter(p => p.team === 'B').length;
        const assignedTeam = teamACount > teamBCount ? 'B' : 'A';
        
        const newPlayers = [
          ...roomToJoin.players,
          {
            uid: user.uid,
            name: profile.name,
            classId: profile.classId,
            team: assignedTeam
          }
        ];
        
        await updateDoc(doc(db, 'rpg_rooms', roomId), {
          players: newPlayers,
          updatedAt: serverTimestamp()
        });
        
        console.log('✅ Entrou na sala, time:', assignedTeam);
        showMessage('success', `Entrou no time ${assignedTeam}!`);
      }
      
      setCurrentRoom({ ...roomToJoin, players: newPlayers || roomToJoin.players });
    } catch (err) {
      console.error('❌ Erro ao entrar na sala:', err);
      showMessage('error', 'Erro ao entrar na sala.');
    } finally {
      releaseProcessing();
    }
  };

  const leaveRoom = async () => {
    if (isProcessing || !currentRoom) return;
    
    setIsProcessing(true);
    console.log('🚪 Saindo da sala:', currentRoom.id);
    
    try {
      if (currentRoom.hostId === user.uid && currentRoom.status === 'waiting') {
        // Host saindo da sala de espera = deletar sala
        await deleteDoc(doc(db, 'rpg_rooms', currentRoom.id));
        console.log('🗑️ Sala deletada pelo host');
        showMessage('success', 'Sala fechada.');
      } else {
        // Jogador saindo
        const newPlayers = currentRoom.players.filter(p => p.uid !== user.uid);
        
        if (newPlayers.length === 0 && currentRoom.status === 'waiting') {
          // Último jogador saiu, deletar sala
          await deleteDoc(doc(db, 'rpg_rooms', currentRoom.id));
        } else {
          await updateDoc(doc(db, 'rpg_rooms', currentRoom.id), {
            players: newPlayers,
            updatedAt: serverTimestamp()
          });
        }
        showMessage('success', 'Você saiu da sala.');
      }
      
      setCurrentRoom(null);
    } catch (err) {
      console.error('❌ Erro ao sair da sala:', err);
      showMessage('error', 'Erro ao sair da sala.');
    } finally {
      releaseProcessing();
    }
  };

  const startGame = async () => {
    if (isProcessing || !currentRoom?.id) {
      console.warn('⚠️ Não foi possível iniciar:', { isProcessing, roomId: currentRoom?.id });
      return;
    }
    
    setIsProcessing(true);
    console.log('⚔️ Iniciando batalha na sala:', currentRoom.id);
    
    try {
      const roomRef = doc(db, 'rpg_rooms', currentRoom.id);
      
      await updateDoc(roomRef, {
        status: 'playing',
        hpA: MAX_HP,
        hpB: MAX_HP,
        turn: 'A',
        battlePhase: 'ask',
        currentQuestion: '',
        currentAnswer: '',
        currentGuess: '',
        updatedAt: serverTimestamp()
      });
      
      console.log('✅ Batalha iniciada com sucesso!');
      showMessage('success', 'A BATALHA COMEÇOU! ⚔️');
    } catch (err) {
      console.error('❌ Erro ao iniciar jogo:', err);
      showMessage('error', `Erro ao iniciar: ${err.message}`);
    } finally {
      releaseProcessing();
    }
  };

  const addBot = async () => {
    if (isProcessing || !currentRoom) return;
    
    setIsProcessing(true);
    console.log('🤖 Adicionando bot...');
    
    try {
      const botPlayer = {
        uid: 'bot_' + Math.random().toString(36).substring(2, 9),
        name: 'Aluno Teste (Bot)',
        classId: 'mago',
        team: 'B'
      };
      
      const newPlayers = [...currentRoom.players, botPlayer];
      
      await updateDoc(doc(db, 'rpg_rooms', currentRoom.id), {
        players: newPlayers,
        updatedAt: serverTimestamp()
      });
      
      console.log('✅ Bot adicionado');
      showMessage('success', 'Bot adicionado ao time B!');
    } catch (err) {
      console.error('❌ Erro ao adicionar bot:', err);
      showMessage('error', 'Erro ao adicionar bot.');
    } finally {
      releaseProcessing();
    }
  };

  // --- AÇÕES DE COMBATE ---

  const submitQuestion = async (e) => {
    e.preventDefault();
    if (!battleInput.question.trim() || !battleInput.answer.trim() || isProcessing || !currentRoom?.id) {
      return;
    }
    
    setIsProcessing(true);
    console.log('📝 Enviando pergunta...');
    
    try {
      const roomRef = doc(db, 'rpg_rooms', currentRoom.id);
      
      await updateDoc(roomRef, {
        currentQuestion: battleInput.question.trim(),
        currentAnswer: battleInput.answer.trim(),
        battlePhase: 'answer',
        updatedAt: serverTimestamp()
      });
      
      setBattleInput({ question: '', answer: '', guess: '' });
      console.log('✅ Pergunta enviada');
    } catch (err) {
      console.error('❌ Erro ao enviar pergunta:', err);
      showMessage('error', 'Erro ao enviar pergunta.');
    } finally {
      releaseProcessing();
    }
  };

  const submitGuess = async (e) => {
    e.preventDefault();
    if (!battleInput.guess.trim() || isProcessing || !currentRoom?.id) {
      return;
    }
    
    setIsProcessing(true);
    console.log('🤔 Enviando resposta...');
    
    try {
      const roomRef = doc(db, 'rpg_rooms', currentRoom.id);
      
      await updateDoc(roomRef, {
        currentGuess: battleInput.guess.trim(),
        battlePhase: 'judge',
        updatedAt: serverTimestamp()
      });
      
      setBattleInput({ ...battleInput, guess: '' });
      console.log('✅ Resposta enviada');
    } catch (err) {
      console.error('❌ Erro ao enviar resposta:', err);
      showMessage('error', 'Erro ao enviar resposta.');
    } finally {
      releaseProcessing();
    }
  };

  const judgeAnswer = async (isCorrect) => {
    if (isProcessing || !currentRoom?.id) return;
    
    setIsProcessing(true);
    console.log('⚖️ Julgando resposta...', isCorrect ? 'CORRETA' : 'ERRADA');
    
    try {
      const isTeamA = currentRoom.turn === 'A';
      let newHpA = currentRoom.hpA;
      let newHpB = currentRoom.hpB;
      
      // Se errou, o time atual perde 1 HP
      if (!isCorrect) {
        if (isTeamA) {
          newHpB = Math.max(0, newHpB - 1);
        } else {
          newHpA = Math.max(0, newHpA - 1);
        }
      }
      
      const roomRef = doc(db, 'rpg_rooms', currentRoom.id);
      
      // Verificar se o jogo acabou
      if (newHpA <= 0 || newHpB <= 0) {
        const winner = newHpA > 0 ? 'A' : 'B';
        console.log('🏆 Vencedor:', 'Time', winner);
        
        await updateDoc(roomRef, {
          status: 'finished',
          winner: winner,
          hpA: newHpA,
          hpB: newHpB,
          battlePhase: 'finished',
          updatedAt: serverTimestamp()
        });
        
        // Atualizar estatísticas dos jogadores (background)
        currentRoom.players.forEach(async (player) => {
          if (player.uid.startsWith('bot_') || !player.uid) return;
          
          try {
            const userRef = doc(db, 'rpg_users', player.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
              const userData = userSnap.data();
              const isWinner = player.team === winner;
              
              await updateDoc(userRef, {
                matchesPlayed: (userData.matchesPlayed || 0) + 1,
                wins: isWinner ? (userData.wins || 0) + 1 : (userData.wins || 0),
                updatedAt: serverTimestamp()
              });
            }
          } catch (err) {
            console.warn('⚠️ Erro ao atualizar perfil do jogador:', player.name, err);
          }
        });
        
        showMessage('success', `Time ${winner} venceu a batalha! 🏆`);
      } else {
        // Continuar jogo
        await updateDoc(roomRef, {
          hpA: newHpA,
          hpB: newHpB,
          turn: isTeamA ? 'B' : 'A',
          battlePhase: 'ask',
          currentQuestion: '',
          currentAnswer: '',
          currentGuess: '',
          updatedAt: serverTimestamp()
        });
        
        console.log('🔄 Próximo turno:', isTeamA ? 'B' : 'A');
      }
    } catch (err) {
      console.error('❌ Erro no julgamento:', err);
      showMessage('error', 'Erro ao processar julgamento.');
    } finally {
      releaseProcessing();
    }
  };

  // --- COMPONENTES DE UI ---

  const HealthBar = ({ hp, team }) => (
    <div className="flex gap-1 justify-center my-2">
      {[...Array(MAX_HP)].map((_, i) => (
        <Heart 
          key={i} 
          className={`w-8 h-8 transition-all duration-300 ${
            i < hp 
              ? 'fill-red-500 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] scale-110' 
              : 'fill-stone-800 text-stone-700'
          }`} 
        />
      ))}
    </div>
  );

  const MessageAlert = () => {
    if (!error && !success) return null;
    
    return (
      <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-2xl animate-in slide-in-from-right duration-300 ${
        error ? 'bg-red-900/90 border border-red-700 text-red-200' : 
        'bg-emerald-900/90 border border-emerald-700 text-emerald-200'
      }`}>
        <div className="flex items-center gap-2">
          {error ? <AlertCircle className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          <p className="font-bold">{error || success}</p>
        </div>
      </div>
    );
  };

  // Tela de carregamento
  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center text-amber-500 font-serif p-4 text-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-stone-900 to-stone-950">
        <Scroll className="w-20 h-20 mb-8 animate-pulse text-amber-600 drop-shadow-[0_0_15px_rgba(217,119,6,0.5)]" />
        <h2 className="text-3xl md:text-5xl font-black uppercase tracking-widest mb-4">Aguarde, Herói</h2>
        <p className="text-stone-400 text-xl md:text-2xl animate-pulse transition-all duration-500">{loadingPhrase}</p>
        {authError && (
          <div className="mt-8 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            <p className="text-red-300 text-sm">{authError}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-white text-sm"
            >
              Recarregar Página
            </button>
          </div>
        )}
        <div className="fixed bottom-4 right-4 text-stone-700 font-bold text-xs uppercase tracking-widest">v.{GAME_VERSION}</div>
      </div>
    );
  }

  // Tela de criação de perfil
  if (isCreatingProfile) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4 font-serif text-stone-200 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-stone-900 to-stone-950">
        <MessageAlert />
        <form onSubmit={handleCreateProfile} className="max-w-md w-full bg-stone-900 border-2 border-stone-700 p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-700 via-yellow-500 to-amber-700"></div>
          <Scroll className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-3xl font-black text-amber-500 text-center mb-6 uppercase tracking-widest">Forjar Herói</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-amber-600 text-sm font-bold mb-2 uppercase tracking-wider">Como serás conhecido?</label>
              <input 
                required 
                disabled={isProcessing} 
                type="text" 
                value={newProfile.name} 
                onChange={e => setNewProfile({...newProfile, name: e.target.value})} 
                className="w-full bg-stone-950 border-2 border-stone-700 p-4 outline-none focus:border-amber-500 text-amber-100 font-bold rounded-lg text-lg text-center disabled:opacity-50" 
                placeholder="Ex: Arthur, o Sábio" 
                maxLength={30}
              />
            </div>
            <div>
              <label className="block text-amber-600 text-sm font-bold mb-2 uppercase tracking-wider">Escolhe o teu caminho</label>
              <div className="grid grid-cols-3 gap-3">
                {CLASSES.map(c => (
                  <button 
                    disabled={isProcessing} 
                    key={c.id} 
                    type="button" 
                    onClick={() => setNewProfile({...newProfile, classId: c.id})} 
                    className={`p-4 border-2 rounded-lg flex flex-col items-center gap-2 transition-all disabled:opacity-50 ${
                      newProfile.classId === c.id 
                        ? 'border-amber-500 bg-stone-800 scale-105 shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
                        : 'border-stone-700 bg-stone-950 hover:border-stone-600 hover:bg-stone-900'
                    }`}
                  >
                    <span className="text-3xl">{c.icon}</span>
                    <span className="text-xs font-bold text-stone-300 uppercase tracking-wider">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <button 
              type="submit" 
              disabled={isProcessing || !newProfile.name.trim()} 
              className="w-full bg-amber-700 hover:bg-amber-600 text-stone-100 font-black py-5 mt-4 uppercase tracking-widest rounded-lg transition-colors shadow-lg shadow-amber-900/50 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Swords className="w-5 h-5"/> Iniciar Jornada</>}
            </button>
          </div>
        </form>
        <div className="fixed bottom-4 right-4 text-stone-700 font-bold text-xs uppercase tracking-widest">v.{GAME_VERSION}</div>
      </div>
    );
  }

  // Tela do lobby (salas)
  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-stone-950 font-serif text-stone-200 p-4 md:p-8">
        <MessageAlert />
        <div className="max-w-5xl mx-auto">
          {/* Header do Jogador */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 mb-8 flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl relative overflow-hidden">
            <div className="absolute -right-10 -top-10 opacity-5">
               <Shield className="w-64 h-64" />
            </div>
            <div className="flex items-center gap-6 z-10">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg border-4 border-stone-800 ${CLASSES.find(c => c.id === profile?.classId)?.color || 'bg-stone-700'}`}>
                {CLASSES.find(c => c.id === profile?.classId)?.icon || '❓'}
              </div>
              <div>
                <h1 className="text-4xl font-black text-amber-500">{profile?.name || 'Herói'}</h1>
                <p className="text-stone-400 font-bold uppercase text-sm tracking-widest bg-stone-950 inline-block px-3 py-1 rounded-full mt-2 border border-stone-800">
                  {CLASSES.find(c => c.id === profile?.classId)?.name || 'Aventureiro'}
                </p>
              </div>
            </div>
            <div className="flex gap-8 text-center bg-stone-950 p-4 rounded-xl border border-stone-800 z-10">
              <div>
                <p className="text-stone-500 text-xs uppercase font-bold tracking-widest mb-1">Vitórias</p>
                <p className="text-3xl font-black text-emerald-500 flex items-center justify-center gap-2">
                  <Trophy className="w-6 h-6"/> {profile?.wins || 0}
                </p>
              </div>
              <div className="w-px bg-stone-800"></div>
              <div>
                <p className="text-stone-500 text-xs uppercase font-bold tracking-widest mb-1">Batalhas</p>
                <p className="text-3xl font-black text-stone-300">{profile?.matchesPlayed || 0}</p>
              </div>
            </div>
          </div>

          {/* Área de Salas */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <h2 className="text-3xl font-black text-stone-300 flex items-center gap-3 uppercase tracking-widest">
              <Castle className="w-8 h-8 text-amber-600"/> Campos de Batalha
            </h2>
            <button 
              onClick={createRoom} 
              disabled={isProcessing} 
              className="w-full sm:w-auto bg-amber-700 hover:bg-amber-600 text-stone-100 font-black px-8 py-4 flex items-center justify-center gap-2 rounded-xl shadow-[0_0_20px_rgba(217,119,6,0.2)] transition-all hover:scale-105 uppercase tracking-wider disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5"/> Criar Batalha</>}
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
                    <p className="text-stone-400 text-sm flex items-center gap-2 font-bold uppercase tracking-wider">
                      <Users className="w-4 h-4 text-amber-500"/> {room.players?.length || 1} Guerreiros
                    </p>
                    <p className="text-stone-500 text-xs mt-1">
                      Time A: {room.players?.filter(p => p.team === 'A').length || 0} | 
                      Time B: {room.players?.filter(p => p.team === 'B').length || 0}
                    </p>
                  </div>
                  <button 
                    onClick={() => joinRoom(room.id)} 
                    disabled={isProcessing} 
                    className="w-full bg-stone-800 hover:bg-amber-700 text-amber-500 hover:text-white border border-stone-700 hover:border-amber-600 py-3 font-black uppercase text-sm rounded-lg transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Swords className="w-4 h-4"/> Entrar no Combate</>}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="fixed bottom-4 right-4 text-stone-700 font-bold text-xs uppercase tracking
        
