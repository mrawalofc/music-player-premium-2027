import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Music, 
  Plus, 
  Trash2, 
  ListMusic, 
  X, 
  Search,
  MoreVertical,
  Repeat,
  Repeat1,
  Shuffle,
  ChevronDown,
  Layers,
  Heart,
  Globe,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { get, set, del, keys } from 'idb-keyval';
import { cn } from './lib/utils';

interface Song {
  id: string;
  title: string;
  artist: string;
  url: string;
  blob?: Blob;
  artworkUrl?: string;
  artworkBlob?: Blob;
  isUserUploaded?: boolean;
}

export default function App() {
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(0));
  const [beatIntensity, setBeatIntensity] = useState(0);
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0]);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [isShuffle, setIsShuffle] = useState(false);
  const [accentColor, setAccentColor] = useState('#00f2ff');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000];

  const currentSong = playlist[currentSongIndex];

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentSong) return;

    // Initialize AudioContext and Equalizer on user gesture
    if (!audioContextRef.current && audioRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      
      const source = ctx.createMediaElementSource(audioRef.current);
      
      // Create and chain filters
      let lastNode: AudioNode = source;
      const filters = EQ_FREQUENCIES.map((freq, i) => {
        const filter = ctx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = eqGains[i];
        lastNode.connect(filter);
        lastNode = filter;
        return filter;
      });

      lastNode.connect(analyser);
      analyser.connect(ctx.destination);
      
      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      eqFiltersRef.current = filters;
    }

    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }

    setIsPlaying(!isPlaying);
  };

  const handleEqChange = (index: number, value: number) => {
    const newGains = [...eqGains];
    newGains[index] = value;
    setEqGains(newGains);
    
    if (eqFiltersRef.current[index]) {
      eqFiltersRef.current[index].gain.value = value;
    }
  };

  const skipTrack = (direction: 'next' | 'prev', e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (playlist.length === 0) return;
    
    let nextIndex = currentSongIndex;
    
    if (isShuffle && direction === 'next') {
      // Pick a random index that isn't the current one (if possible)
      if (playlist.length > 1) {
        let randomIndex = currentSongIndex;
        while (randomIndex === currentSongIndex) {
          randomIndex = Math.floor(Math.random() * playlist.length);
        }
        nextIndex = randomIndex;
      } else {
        nextIndex = 0;
      }
    } else {
      if (direction === 'next') {
        nextIndex = (currentSongIndex + 1) % playlist.length;
      } else {
        nextIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
      }
    }
    
    setCurrentSongIndex(nextIndex);
    setIsPlaying(true);
  };

  const handleSongEnd = () => {
    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else if (isShuffle) {
      skipTrack('next');
    } else if (repeatMode === 'all') {
      skipTrack('next');
    } else if (repeatMode === 'off') {
      if (currentSongIndex < playlist.length - 1) {
        skipTrack('next');
      } else {
        setIsPlaying(false);
      }
    }
  };

  const toggleRepeat = () => {
    const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(repeatMode);
    setRepeatMode(modes[(currentIndex + 1) % modes.length]);
  };

  const toggleShuffle = () => {
    setIsShuffle(!isShuffle);
  };

  const handleArtworkUpload = async (songId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const songData = await get(songId) as any;
      if (songData) {
        songData.artworkBlob = file;
        await set(songId, songData);
        
        const artworkUrl = URL.createObjectURL(file);
        setPlaylist(prev => prev.map(s => {
          if (s.id === songId) {
            if (s.artworkUrl) URL.revokeObjectURL(s.artworkUrl);
            return { ...s, artworkUrl, artworkBlob: file };
          }
          return s;
        }));
      }
    } catch (err) {
      console.error("Failed to update artwork:", err);
    }
  };

  const handleArtworkSearch = async (song: Song) => {
    setIsUploading(true);
    try {
      const query = `${song.title} ${song.artist}`;
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`);
      const data = await response.json();
      
      if (data.results && data.results[0]) {
        const itunesArtwork = data.results[0].artworkUrl100.replace('100x100', '600x600');
        
        const songData = await get(song.id) as any;
        if (songData) {
          const imgResponse = await fetch(itunesArtwork);
          const blob = await imgResponse.blob();
          songData.artworkBlob = blob;
          await set(song.id, songData);
          
          const artworkUrl = URL.createObjectURL(blob);
          setPlaylist(prev => prev.map(s => {
            if (s.id === song.id) {
              if (s.artworkUrl) URL.revokeObjectURL(s.artworkUrl);
              return { ...s, artworkUrl, artworkBlob: blob };
            }
            return s;
          }));
        }
      } else {
        console.warn("No artwork found for:", query);
      }
    } catch (err) {
      console.error("Failed to search artwork:", err);
    } finally {
      setIsUploading(false);
    }
  };

  // Media Session API Support for Android/Mobile
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        artwork: currentSong.artworkUrl ? [
          { src: currentSong.artworkUrl, sizes: '512x512', type: 'image/png' }
        ] : [
          { src: 'https://ais-dev-hhixeqfcls4blmbostvtew-268226720841.europe-west2.run.app/favicon.ico', sizes: '192x192', type: 'image/png' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('previoustrack', () => skipTrack('prev'));
      navigator.mediaSession.setActionHandler('nexttrack', () => skipTrack('next'));
    }
  }, [currentSong, skipTrack]);

  // Handle Playback State in System UI
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  // Apply accent color to CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--neon-blue', accentColor);
    set('sonicwave_accent_color', accentColor);
  }, [accentColor]);

  // Load stored persistent settings
  useEffect(() => {
    const loadSettings = async () => {
      const storedColor = await get('sonicwave_accent_color');
      if (storedColor) setAccentColor(storedColor);
    };
    loadSettings();
  }, []);

  // Load from IndexedDB on mount
  useEffect(() => {
    const loadStoredSongs = async () => {
      try {
        const idbKeys = await keys();
        const musicKeys = idbKeys.filter(k => typeof k === 'string' && k.startsWith('song_'));
        
        const storedSongs: Song[] = [];
        for (const key of musicKeys) {
          const songData = await get(key) as { title: string, artist?: string, blob: Blob, artworkBlob?: Blob };
          if (songData && songData.blob) {
            const url = URL.createObjectURL(songData.blob);
            let artworkUrl = undefined;
            if (songData.artworkBlob) {
              artworkUrl = URL.createObjectURL(songData.artworkBlob);
            }
            storedSongs.push({
              id: key as string,
              title: songData.title,
              artist: songData.artist || 'Unknown Legend',
              url: url,
              blob: songData.blob,
              artworkUrl,
              artworkBlob: songData.artworkBlob,
              isUserUploaded: true
            });
          }
        }
        setPlaylist(storedSongs);
      } catch (err) {
        console.error("Failed to load music:", err);
      }
    };

    loadStoredSongs();

    return () => {
      playlist.forEach(song => {
        if (song.isUserUploaded && song.url.startsWith('blob:')) {
          URL.revokeObjectURL(song.url);
        }
        if (song.artworkUrl && song.artworkUrl.startsWith('blob:')) {
          URL.revokeObjectURL(song.artworkUrl);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying && currentSong) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      } else {
        audioRef.current.pause();
      }
    }
  }, [currentSongIndex, isPlaying, !!currentSong]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newSongs: Song[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = `song_${Date.now()}_${i}`;
      const songData = {
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Your Sound",
        blob: file
      };

      try {
        await set(id, songData);
        const url = URL.createObjectURL(file);
        newSongs.push({
          id,
          title: songData.title,
          artist: songData.artist,
          url,
          blob: file,
          isUserUploaded: true
        });
      } catch (err) {
        console.error("Failed to store music:", err);
      }
    }

    if (newSongs.length > 0) {
      setPlaylist(prev => [...prev, ...newSongs]);
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSong = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await del(id);
      const updatedPlaylist = playlist.filter(s => s.id !== id);
      setPlaylist(updatedPlaylist);
      if (currentSong?.id === id) {
        setIsPlaying(false);
        setCurrentSongIndex(0);
      }
    } catch (err) {
      console.error("Failed to remove song:", err);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const filteredPlaylist = useMemo(() => 
    playlist.filter(song => 
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.artist.toLowerCase().includes(searchQuery.toLowerCase())
    ), [playlist, searchQuery]);

  // Visualization Loop
  useEffect(() => {
    if (!isPlaying || !analyserRef.current) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate beat intensity (average of lower frequencies)
      let sum = 0;
      for (let i = 0; i < 20; i++) {
        sum += dataArray[i];
      }
      const intensity = sum / (20 * 255);
      setBeatIntensity(intensity);
      setFrequencyData(new Uint8Array(dataArray));
      
      animationFrameRef.current = requestAnimationFrame(update);
    };

    animationFrameRef.current = requestAnimationFrame(update);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying]);

  return (
    <div className="h-screen w-full flex flex-col bg-[#050505] relative overflow-hidden select-none">
      {/* Immersive Background (Subtle) */}
      <div className="absolute inset-0 z-0">
        <motion.div 
          animate={isPlaying ? {
            scale: [1, 1 + (beatIntensity * 0.2), 1],
            opacity: [0.05, 0.1 + (beatIntensity * 0.1), 0.05],
          } : { opacity: 0.05 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-gradient-to-tr from-neon-blue/20 via-transparent to-neon-purple/20 blur-[100px] pointer-events-none" 
        />
        <div className="absolute inset-0 noise-bg pointer-events-none" />
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col relative z-20 safe-top">
        {/* Header */}
        <header className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 glass-panel hover:bg-white/10 transition-colors"
            >
              <Settings size={18} className="text-neon-blue" />
            </button>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">SonicWave</h1>
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Mobile Premium</p>
            </div>
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-10 h-10 rounded-xl glass-panel flex items-center justify-center text-neon-blue hover:bg-neon-blue hover:text-black transition-all"
          >
            {isUploading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus size={20} />}
          </button>
        </header>

        {/* Search */}
        <div className="px-6 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
            <input 
              type="text"
              placeholder="SEARCH LIBRARY..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-neon-blue/50 transition-all placeholder:text-white/10"
            />
          </div>
        </div>

        {/* Library Scroll */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-32 space-y-3">
          {filteredPlaylist.length > 0 ? (
            filteredPlaylist.map((song, index) => (
              <motion.div
                layout
                key={song.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "group flex items-center gap-4 p-4 rounded-3xl cursor-pointer transition-all border",
                  currentSongIndex === playlist.indexOf(song)
                    ? "bg-white/10 border-white/20 shadow-lg"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                )}
                onClick={() => {
                  setCurrentSongIndex(playlist.indexOf(song));
                  setIsPlaying(true);
                }}
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center font-mono text-[10px] border shrink-0 transition-all overflow-hidden",
                  currentSongIndex === playlist.indexOf(song) ? "bg-neon-blue text-black border-neon-blue" : "bg-black/50 text-white/20 border-white/5"
                )}>
                  {song.artworkUrl ? (
                    <img src={song.artworkUrl} alt="" className="w-full h-full object-cover" />
                  ) : currentSongIndex === playlist.indexOf(song) && isPlaying ? (
                    <Music size={16} className="animate-pulse" />
                  ) : (
                    (index + 1).toString().padStart(2, '0')
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className={cn(
                    "text-sm font-bold truncate tracking-tight",
                    currentSongIndex === playlist.indexOf(song) ? "text-neon-blue" : "text-white"
                  )}>
                    {song.title}
                  </h4>
                  <p className="text-[9px] uppercase tracking-widest text-white/20 mt-0.5 font-mono">{song.artist}</p>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleArtworkSearch(song);
                    }}
                    className="p-2 text-white/20 hover:text-neon-blue transition-colors"
                  >
                    <Globe size={16} />
                  </button>
                  <label className="p-2 text-white/20 hover:text-neon-blue transition-colors cursor-pointer">
                    <Plus size={16} />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => handleArtworkUpload(song.id, e)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                  <button 
                    onClick={(e) => removeSong(song.id, e)}
                    className="p-2 text-white/20 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="h-40 flex flex-col items-center justify-center opacity-20 text-center">
              <Music size={32} className="mb-4" />
              <p className="font-mono text-[10px] tracking-widest uppercase">No Music Found</p>
            </div>
          )}
        </div>
      </div>

      {/* Mini Player */}
      <AnimatePresence>
        {currentSong && !isPlayerOpen && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            onClick={() => setIsPlayerOpen(true)}
            className="fixed bottom-6 left-6 right-6 z-50 glass-panel p-3 rounded-[32px] border border-white/10 flex items-center gap-4 cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/5 flex items-center justify-center relative overflow-hidden group">
               {currentSong.artworkUrl ? (
                 <img src={currentSong.artworkUrl} alt="" className="w-full h-full object-cover" />
               ) : (
                 <motion.div 
                  animate={isPlaying ? { rotate: 360 } : {}}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="text-neon-blue/40"
                 >
                   <Music size={24} />
                 </motion.div>
               )}
               <div className="absolute inset-0 bg-neon-blue/5 animate-pulse" />
            </div>

            <div className="flex-1 min-w-0">
               <h4 className="text-sm font-bold truncate pr-4">{currentSong.title}</h4>
               <p className="text-[10px] font-mono uppercase tracking-widest text-white/20">{currentSong.artist}</p>
            </div>

            <div className="flex items-center gap-1 pr-2">
               <button 
                onClick={(e) => togglePlay(e)}
                className="w-12 h-12 flex items-center justify-center text-white bg-white/5 hover:bg-white/10 rounded-2xl transition-colors"
               >
                 {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} className="ml-1" fill="currentColor" />}
               </button>
               <button 
                onClick={(e) => skipTrack('next', e)}
                className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white"
               >
                 <SkipForward size={20} fill="currentColor" />
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Screen Player Layer */}
      <AnimatePresence>
        {isPlayerOpen && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] bg-[#050505] flex flex-col p-8 overflow-hidden touch-none"
          >
            {/* Background for player */}
            <div className="absolute inset-0 z-0">
               <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-gradient-to-br from-neon-blue/30 via-transparent to-neon-purple/30 blur-[150px]" />
               <div className="absolute inset-0 noise-bg opacity-10" />
            </div>

            <nav className="relative z-10 flex items-center justify-between mb-8 safe-top">
              <button 
                onClick={() => setIsPlayerOpen(false)}
                className="w-12 h-12 rounded-full glass-panel flex items-center justify-center text-white/40 active:scale-90 transition-transform"
              >
                <ChevronDown size={24} />
              </button>
              <div className="text-center">
                <p className="text-[10px] font-mono tracking-widest text-neon-blue uppercase">Now Sounding</p>
              </div>
              <button 
                onClick={() => setShowEqualizer(!showEqualizer)}
                className={cn(
                  "w-12 h-12 rounded-full glass-panel flex items-center justify-center transition-all active:scale-90",
                  showEqualizer ? "text-neon-blue bg-white/10" : "text-white/40"
                )}
              >
                <Layers size={20} />
              </button>
            </nav>

            <div className="flex-1 flex flex-col items-center justify-center relative z-10">
              <AnimatePresence mode="wait">
                {showEqualizer ? (
                  <motion.div 
                    key="eq"
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="w-full max-w-sm glass-panel p-8 rounded-[40px] border border-white/10 mb-12"
                  >
                    <div className="flex justify-between items-end h-48 gap-4 mb-4">
                      {eqGains.map((gain, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center h-full">
                          <div className="flex-1 w-2 bg-white/5 rounded-full relative mb-4">
                            <motion.div 
                              className="absolute bottom-0 w-full bg-neon-blue rounded-full shadow-[0_0_15px_rgba(0,242,255,0.5)]"
                              animate={{ height: `${((gain + 12) / 24) * 100}%` }}
                            />
                            <input 
                              type="range"
                              min="-12"
                              max="12"
                              step="1"
                              value={gain}
                              onChange={(e) => handleEqChange(i, parseFloat(e.target.value))}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer [writing-mode:bt-lr] appearance-none"
                              style={{ transform: 'rotate(-90deg)' }}
                            />
                          </div>
                          <p className="text-[9px] font-mono text-white/20 uppercase">
                            {EQ_FREQUENCIES[i] < 1000 ? `${EQ_FREQUENCIES[i]}Hz` : `${EQ_FREQUENCIES[i]/1000}kHz`}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-mono text-white/40 tracking-[0.3em] uppercase">Visual EQ Engine</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="visualizer"
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="relative w-72 h-72 md:w-96 md:h-96 flex items-center justify-center mb-16"
                  >
                    <motion.div 
                      animate={isPlaying ? { rotate: 360, scale: [1, 1.05, 1] } : {}}
                      transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 border border-white/5 rounded-full"
                    />
                    <motion.div 
                      animate={isPlaying ? { rotate: -360, scale: [1, 1.15, 1] } : {}}
                      transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-8 border border-neon-blue/10 rounded-full"
                    />
                    
                    <motion.div 
                      className="w-full h-full rounded-full glass-panel flex items-center justify-center relative overflow-hidden border-2 border-white/5 shadow-[0_0_100px_rgba(0,242,255,0.15)]"
                      animate={isPlaying ? { 
                        scale: [1, 1.05 + (beatIntensity * 0.1), 1],
                        boxShadow: isPlaying 
                          ? [
                              '0 0 80px rgba(0,242,255,0.1)',
                              `0 0 ${100 + (beatIntensity * 100)}px rgba(0,242,255,${0.1 + beatIntensity * 0.4})`,
                              '0 0 80px rgba(0,242,255,0.1)'
                            ] 
                          : '0 0 80px rgba(0,242,255,0.1)'
                      } : {}}
                      transition={{ duration: 0.15 }}
                    >
                        <motion.div
                          animate={isPlaying ? { rotate: 360 } : {}}
                          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                          className="bg-[#0a0a0a] w-52 h-52 rounded-full border-4 border-white/5 flex items-center justify-center shadow-2xl relative overflow-hidden"
                        >
                          {currentSong?.artworkUrl ? (
                            <img src={currentSong.artworkUrl} alt="" className="w-full h-full object-cover opacity-80" />
                          ) : (
                            <Music size={56} className="text-neon-blue/60" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent rounded-full" />
                        </motion.div>
                    </motion.div>

                    <div className="absolute inset-[-60px] pointer-events-none">
                        {[...Array(32)].map((_, i) => {
                          const freqValue = frequencyData[i % frequencyData.length] || 0;
                          const sizeMultiplier = freqValue / 255;
                          
                          return (
                            <motion.div
                              key={i}
                              className="absolute w-1 bg-neon-blue rounded-full"
                              style={{
                                left: '50%',
                                top: '50%',
                                height: '24px',
                                transformOrigin: 'bottom center',
                                transform: `rotate(${i * (360/32)}deg) translateY(-180px)`
                              }}
                              animate={isPlaying ? { 
                                height: 24 + (sizeMultiplier * 100),
                                opacity: 0.2 + (sizeMultiplier * 0.8),
                                backgroundColor: sizeMultiplier > 0.7 ? '#bc13fe' : '#00f2ff',
                                boxShadow: sizeMultiplier > 0.5 ? `0 0 ${20 * sizeMultiplier}px #00f2ff` : 'none'
                              } : { height: 10, opacity: 0.1 }}
                              transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            />
                          );
                        })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Info */}
              <div className="text-center mb-12 w-full px-4 overflow-hidden">
                <motion.h2 
                  layoutId="song-title"
                  className="text-4xl md:text-5xl font-black mb-3 truncate tracking-tighter"
                >
                  {currentSong?.title}
                </motion.h2>
                <motion.p 
                  layoutId="song-artist"
                  className="text-sm font-mono uppercase tracking-[0.4em] text-white/30"
                >
                  {currentSong?.artist}
                </motion.p>
              </div>

              {/* Progress Slider */}
              <div className="w-full max-w-sm mb-12">
                 <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={false}
                      animate={{ width: `${(currentTime / duration) * 100}%` }}
                      className="absolute h-full bg-gradient-to-r from-neon-blue to-neon-purple shadow-[0_0_20px_rgba(0,242,255,0.6)]"
                    />
                    <input 
                      type="range"
                      min="0"
                      max={duration || 0}
                      step="0.1"
                      value={currentTime}
                      onChange={(e) => {
                        const time = parseFloat(e.target.value);
                        if (audioRef.current) audioRef.current.currentTime = time;
                        setCurrentTime(time);
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full z-10"
                    />
                 </div>
                 <div className="flex justify-between mt-4 font-mono text-[10px] text-white/20 uppercase tracking-widest">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                 </div>
              </div>

              {/* Controls Panel */}
              <div className="flex items-center gap-8 p-6 rounded-[40px] glass-panel border border-white/10 shadow-2xl relative mb-12">
                 <button 
                  onClick={toggleShuffle}
                  className={cn(
                    "p-3 transition-colors",
                    isShuffle ? "text-neon-blue" : "text-white/20 hover:text-white"
                  )}
                 >
                   <Shuffle size={20} />
                 </button>
                 <button 
                  onClick={(e) => skipTrack('prev', e)}
                  className="p-3 text-white transition-transform active:scale-90"
                 >
                  <SkipBack size={32} fill="currentColor" />
                 </button>
                 
                 <button 
                  onClick={(e) => togglePlay(e)}
                  className="w-24 h-24 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-[0_0_40px_rgba(255,255,255,0.25)] relative z-10"
                 >
                  {isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} className="ml-1" fill="currentColor" />}
                 </button>
 
                 <button 
                  onClick={(e) => skipTrack('next', e)}
                  className="p-3 text-white transition-transform active:scale-90"
                 >
                  <SkipForward size={32} fill="currentColor" />
                 </button>
                 <button 
                  onClick={toggleRepeat}
                  className={cn(
                    "p-3 transition-colors relative",
                    repeatMode !== 'off' ? "text-neon-blue" : "text-white/20 hover:text-white"
                  )}
                 >
                   {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
                   {repeatMode === 'all' && <div className="absolute top-1 right-1 w-1 h-1 bg-neon-blue rounded-full" />}
                 </button>
              </div>

              {/* Volume (Quick Access) */}
              <div className="w-full max-w-[200px] flex items-center gap-4 bg-white/5 py-3 px-6 rounded-full border border-white/5 safe-bottom">
                <button onClick={() => setIsMuted(!isMuted)} className="text-white/30">
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-neon-blue"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Native Assets */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="audio/*" 
        multiple 
        className="hidden" 
      />
      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-end sm:items-center justify-center"
          >
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="w-full max-w-md bg-[#0a0a0a] rounded-t-[40px] sm:rounded-[40px] p-8 border border-white/10 shadow-2xl safe-bottom"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-bold">Customization</h2>
                  <p className="text-xs text-white/40 uppercase tracking-widest font-mono">Accent Theme</p>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] text-white/20 uppercase tracking-widest font-mono mb-4 block">Preset Palettes</label>
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { name: 'Electric', color: '#00f2ff' },
                      { name: 'Purple', color: '#bc13fe' },
                      { name: 'Crimson', color: '#ff2d55' },
                      { name: 'Emerald', color: '#00ff88' },
                      { name: 'Amber', color: '#ffcc00' },
                      { name: 'Pink', color: '#ff00ff' },
                      { name: 'White', color: '#ffffff' },
                      { name: 'Sunset', color: '#ff5e3a' },
                    ].map((theme) => (
                      <button
                        key={theme.name}
                        onClick={() => setAccentColor(theme.color)}
                        className={cn(
                          "flex flex-col items-center gap-2 group transition-all",
                          accentColor === theme.color ? "scale-110" : "opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                        )}
                      >
                        <div 
                          className="w-12 h-12 rounded-2xl border-2 transition-all shadow-lg"
                          style={{ 
                            backgroundColor: theme.color,
                            borderColor: accentColor === theme.color ? 'white' : 'transparent' 
                          }}
                        />
                        <span className="text-[9px] font-mono uppercase tracking-tighter">{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <label className="text-[10px] text-white/20 uppercase tracking-widest font-mono mb-4 block">Custom Color Picker</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="color" 
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-16 h-12 bg-transparent border-0 rounded-xl cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="text-xs font-mono uppercase text-white/60 mb-1">{accentColor}</div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full transition-all duration-300" 
                          style={{ backgroundColor: accentColor, width: '100%' }} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all mt-4"
                  style={{ color: accentColor }}
                >
                  Apply & Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <audio 
        ref={audioRef} 
        src={currentSong?.url} 
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={handleSongEnd}
      />

      <style>{`
        input[type='range']::-webkit-slider-thumb {
          appearance: none;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
        }
      `}</style>
    </div>
  );
}
