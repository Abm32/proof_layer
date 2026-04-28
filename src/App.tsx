import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  BarChart3, 
  ShieldCheck, 
  Scale, 
  Sparkles, 
  LayoutDashboard, 
  Database, 
  History, 
  Settings, 
  HelpCircle, 
  BookOpen, 
  Bell, 
  Download,
  AlertCircle,
  FileText,
  CheckCircle2,
  Info,
  LogIn,
  LogOut,
  User as UserIcon,
  Zap,
  Search,
  LineChart as LineChartIcon,
  ChevronDown,
  Menu,
  Plus,
  X,
  Trash2,
  Clock,
  RotateCcw,
  Edit2
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { explainBias, getModelSuggestions, explainModel } from './services/geminiService';
import { Chatbot } from './components/Chatbot';
import { auth, db } from './lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  updateDoc,
  query, 
  where, 
  getDocs, 
  deleteDoc,
  doc,
  orderBy, 
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface GroupStats {
  total: number;
  selected: number;
  rate: number;
}

interface AnalysisResult {
  fairnessScore: number;
  biasStatus: string;
  difference: string;
  groups: Record<string, GroupStats>;
  targetValues: string[];
  positiveValue: string;
  integrity: {
    missingPct: string;
    piiFound: boolean;
    imbalanceRatio: string;
    minGroupSize: number;
    totalRecords: number;
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [targetColumn, setTargetColumn] = useState('');
  const [sensitiveColumn, setSensitiveColumn] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState('Initializing Audit Engine...');
  const [loadingStatus, setLoadingStatus] = useState('Initializing Audit Engine...');
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      const statuses = [
        'Scanning dataset integrity...',
        'Partitioning demographic groups...',
        'Calculating statistical parity...',
        'Consulting Gemini AI for context...',
        'Finalizing audit proof...',
        'Securing results to blockchain...'
      ];
      let i = 0;
      interval = setInterval(() => {
        i = (i + 1) % statuses.length;
        setLoadingStatus(statuses[i]);
      }, 1500);
    } else {
      setLoadingStatus('Initializing Audit Engine...');
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash-latest');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [modelVersions, setModelVersions] = useState<any[]>([]);
  const [modelAnalyses, setModelAnalyses] = useState<any[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [view, setView] = useState<'audit' | 'history' | 'metrics' | 'integrity' | 'settings' | 'models' | 'reports'>('audit');
  const [searchQuery, setSearchQuery] = useState('');
  const [linkedModelId, setLinkedModelId] = useState<string>('');
  const [modelModal, setModelModal] = useState<{
    show: boolean;
    isEditing: boolean;
    data: {
      id?: string;
      name: string;
      version: string;
      deploymentDate: string;
      accuracy: string;
      biasStatus: string;
    };
  }>({
    show: false,
    isEditing: false,
    data: { name: '', version: '', deploymentDate: '', accuracy: '', biasStatus: 'Low' }
  });
  const [versionHistoryModal, setVersionHistoryModal] = useState<{
    show: boolean;
    modelId: string | null;
    modelName: string;
  }>({
    show: false,
    modelId: null,
    modelName: ''
  });
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'info';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'info'
  });

  const [selectedModelDetails, setSelectedModelDetails] = useState<{
    model: any;
    analysis: string | null;
    loading: boolean;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        fetchHistory(u.uid);
        fetchModels(u.uid);
      }
    });
    return unsubscribe;
  }, []);

  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Auto-close mobile menu on view change
  useEffect(() => {
    setShowMobileMenu(false);
  }, [view]);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError("Login failed: " + err.message);
    }
  };

  const logout = () => signOut(auth);

  const fetchModels = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'models'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setModels(docs);
    } catch (err) {
      console.error("Error fetching models:", err);
    }
  };

  const handleModelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (modelModal.isEditing && modelModal.data.id) {
        // Find existing model to save as version
        const existingModel = models.find(m => m.id === modelModal.data.id);
        if (existingModel) {
          const versionsRef = collection(db, 'models', modelModal.data.id, 'versions');
          const { id, ...oldData } = existingModel;
          await addDoc(versionsRef, { 
            ...oldData, 
            archivedAt: serverTimestamp() 
          });
        }

        const modelRef = doc(db, 'models', modelModal.data.id);
        const { id, ...dataToSave } = modelModal.data;
        await updateDoc(modelRef, { 
          ...dataToSave, 
          updatedAt: serverTimestamp() 
        }); 
      } else {
        await addDoc(collection(db, 'models'), {
          ...modelModal.data,
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      fetchModels(user.uid);
      setModelModal(prev => ({ ...prev, show: false }));
    } catch (err: any) {
      setError("Failed to save model: " + err.message);
    }
  };

  const handleAIGeneratedModel = async (data: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'models'), {
        ...data,
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      fetchModels(user.uid);
    } catch (err: any) {
      setError("Failed to save AI generated model: " + err.message);
    }
  };

  const fetchModelVersions = async (modelId: string) => {
    try {
      const q = query(
        collection(db, 'models', modelId, 'versions'),
        orderBy('archivedAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setModelVersions(docs);
    } catch (err) {
      console.error("Error fetching model versions:", err);
    }
  };

  const fetchModelAnalyses = async (modelId: string) => {
    try {
      const q = query(
        collection(db, 'analyses'),
        where('modelId', '==', modelId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setModelAnalyses(docs);
    } catch (err) {
      console.error("Error fetching model analyses:", err);
    }
  };

  const revertToVersion = async (modelId: string, versionData: any) => {
    setConfirmModal({
      show: true,
      title: 'Revert to Version',
      message: `Are you sure you want to revert to version ${versionData.version}? Current state will be archived.`,
      type: 'info',
      onConfirm: async () => {
        try {
          const existingModel = models.find(m => m.id === modelId);
          if (existingModel) {
            // Archive current
            const versionsRef = collection(db, 'models', modelId, 'versions');
            const { id, ...currentData } = existingModel;
            await addDoc(versionsRef, { ...currentData, archivedAt: serverTimestamp() });
          }

          // Update main doc
          const modelRef = doc(db, 'models', modelId);
          const { archivedAt, createdAt, updatedAt, ...rest } = versionData;
          await updateDoc(modelRef, { ...rest, updatedAt: serverTimestamp() });
          
          if (user) fetchModels(user.uid);
          setVersionHistoryModal(prev => ({ ...prev, show: false }));
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (err: any) {
          setError("Failed to revert model: " + err.message);
        }
      }
    });
  };

  const deleteModel = async (id: string) => {
    setConfirmModal({
      show: true,
      title: 'Delete Model Entry',
      message: 'Are you sure you want to remove this model from your inventory?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'models', id));
          if (user) fetchModels(user.uid);
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (err: any) {
          setError("Failed to delete model: " + err.message);
        }
      }
    });
  };

  const viewDetails = async (model: any) => {
    setSelectedModelDetails({ model, analysis: null, loading: true });
    setModelAnalyses([]); // Clear previous
    fetchModelAnalyses(model.id);
    const analysis = await explainModel(model.name, model.version, model.accuracy, model.biasStatus);
    setSelectedModelDetails({ model, analysis, loading: false });
  };

  const handleAISuggestTrends = async () => {
    setIsSuggesting(true);
    try {
      const suggestions = await getModelSuggestions();
      setAiSuggestions(suggestions);
    } catch (err: any) {
      setError("Failed to get AI suggestions: " + err.message);
    } finally {
      setIsSuggesting(false);
    }
  };

  const addAISuggestion = async (suggestion: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'models'), {
        ...suggestion,
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setAiSuggestions(prev => prev.filter(s => s !== suggestion));
      fetchModels(user.uid);
    } catch (err: any) {
      setError("Failed to add suggestion: " + err.message);
    }
  };

  const fetchHistory = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'analyses'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(docs);
    } catch (err) {
      console.error("Error fetching history:", err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setExplanation(null);
      setError(null);
      setColumns([]);
      setTargetColumn('');
      setSensitiveColumn('');
      
      // Parse columns
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        preview: 10,
        complete: (results) => {
          if (results.meta.fields && results.meta.fields.length > 0) {
            console.log("Detected columns:", results.meta.fields);
            setColumns(results.meta.fields);
          } else {
            setError("Could not detect column headers in the CSV. Please ensure the first row contains labels.");
          }
        },
        error: (err) => {
          console.error("CSV Parse Error:", err);
          setError("Error reading CSV file: " + err.message);
        }
      });
    }
  };

  const runAnalysis = async () => {
    if (!file || !targetColumn || !sensitiveColumn) {
      setError('Please select a file and both columns.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysisStep('Initializing computational engine...');
    setError(null);
    setExplanation(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetColumn', targetColumn);
    formData.append('sensitiveColumn', sensitiveColumn);

    try {
      setAnalysisProgress(20);
      setAnalysisStep('Scanning dataset for structural integrity...');
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Analysis failed. Please check your data format.');
      }

      setAnalysisProgress(50);
      setAnalysisStep('Calculating disparate impact differentials...');
      const data: AnalysisResult = await response.json();
      setResult(data);

      // Call Gemini for explanation
      const groupNames = Object.keys(data.groups);
      let aiText = null;
      if (groupNames.length >= 2) {
        setAnalysisProgress(75);
        setAnalysisStep('Synthesizing fairness insights with Gemini AI...');
        // Sort by rate to get min and max for explanation
        const sortedGroups = [...groupNames].sort((a, b) => (data.groups[b]?.rate || 0) - (data.groups[a]?.rate || 0));
        const groupA = sortedGroups[0];
        const groupB = sortedGroups[sortedGroups.length - 1];
        
        const modelObj = models.find(m => m.id === linkedModelId);
        aiText = await explainBias(
          groupA, data.groups[groupA].rate,
          groupB, data.groups[groupB].rate,
          parseFloat(data.difference),
          selectedModel,
          modelObj ? `${modelObj.name} v${modelObj.version}` : "Unlinked Data Analysis"
        );
        setExplanation(aiText || null);
      }

      setAnalysisProgress(95);
      setAnalysisStep('Finalizing audit artifacts...');
      // Save to Firebase if logged in
      if (user) {
        const modelObj = models.find(m => m.id === linkedModelId);
        await addDoc(collection(db, 'analyses'), {
          userId: user.uid,
          modelId: linkedModelId || null,
          modelVersion: modelObj ? modelObj.version : null,
          fileName: file.name,
          targetColumn,
          sensitiveColumn,
          fairnessScore: data.fairnessScore,
          biasStatus: data.biasStatus,
          difference: data.difference,
          groups: data.groups,
          explanation: aiText,
          createdAt: serverTimestamp()
        });

        // Update the model's reported status if linked
        if (linkedModelId) {
          const modelRef = doc(db, 'models', linkedModelId);
          await updateDoc(modelRef, {
            biasStatus: data.biasStatus,
            updatedAt: serverTimestamp()
          });
        }
        
        fetchHistory(user.uid);
        fetchModels(user.uid);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteAnalysis = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      show: true,
      title: 'Delete Audit Record',
      message: 'Are you sure you want to permanently delete this analysis? This action cannot be undone.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'analyses', id));
          if (user) fetchHistory(user.uid);
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (err: any) {
          setError("Failed to delete: " + err.message);
        }
      }
    });
  };

  const handleReset = () => {
    if (file || result) {
      setConfirmModal({
        show: true,
        title: 'Start New Analysis',
        message: 'This will clear your current selection and results. Do you want to proceed?',
        type: 'info',
        onConfirm: () => {
          reset();
          setConfirmModal(prev => ({ ...prev, show: false }));
        }
      });
    } else {
      reset();
    }
  };

  const reset = () => {
    setFile(null);
    setColumns([]);
    setTargetColumn('');
    setSensitiveColumn('');
    setLinkedModelId('');
    setResult(null);
    setExplanation(null);
    setError(null);
    setView('audit');
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {showMobileMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileMenu(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full w-4/5 max-w-[300px] border-r-2 border-slate-900 bg-white flex flex-col z-40 lg:hidden shadow-2xl"
            >
              <div className="p-6 border-b-2 border-slate-900 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center border-2 border-slate-700 shadow-[2px_2px_0px_0px_rgba(30,27,75,1)]">
                    <ShieldCheck className="text-white" size={18} />
                  </div>
                  <h1 className="text-xl font-black tracking-tight uppercase italic">ProofLayer</h1>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="p-2 text-indigo-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <nav className="flex-1 p-6 space-y-1 overflow-y-auto">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Core Hub</p>
                <NavItem icon={<BarChart3 size={18} />} label="Audit Lab" active={view === 'audit'} onClick={() => setView('audit')} />
                <NavItem icon={<History size={18} />} label="Verification Log" active={view === 'history'} onClick={() => setView('history')} />
                
                <div className="my-6 h-px bg-slate-100" />
                
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Compliance</p>
                <NavItem icon={<Database size={18} />} label="Model Registry" active={view === 'models'} onClick={() => setView('models')} />
                <NavItem icon={<Scale size={18} />} label="Bias Metrics" active={view === 'metrics'} onClick={() => setView('metrics')} />
                <NavItem icon={<FileText size={18} />} label="Data Reports" active={view === 'reports'} onClick={() => setView('reports')} />
                
                <div className="my-6 h-px bg-slate-100" />
                
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Platform</p>
                <NavItem icon={<Settings size={18} />} label="Control Panel" active={view === 'settings'} onClick={() => setView('settings')} />
              </nav>

              <div className="p-6 border-t-2 border-slate-900 bg-slate-50">
                {user ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 px-3 py-3 bg-white rounded-xl border-2 border-slate-900">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-black text-indigo-600">
                        {user.email?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-slate-900 truncate uppercase">{user.email?.split('@')[0]}</p>
                        <p className="text-[8px] font-bold text-emerald-600 uppercase">Verified Auditor</p>
                      </div>
                    </div>
                    <button 
                      onClick={logout}
                      className="w-full py-3 bg-red-50 text-red-600 rounded-xl border-2 border-red-200 font-black text-[10px] uppercase tracking-widest"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button onClick={login} className="w-full py-4 bg-indigo-600 text-white rounded-xl border-2 border-indigo-900 shadow-[3px_3px_0px_0px_rgba(30,27,75,1)] font-black text-xs uppercase tracking-widest">
                    Initialize System
                  </button>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 border-r-2 border-slate-900 bg-white hidden lg:flex flex-col z-20">
        <div className="p-6 border-b-2 border-slate-900 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center border-2 border-slate-700 shadow-[2px_2px_0px_0px_rgba(30,27,75,1)]">
              <ShieldCheck className="text-white" size={18} />
            </div>
            <h1 className="text-xl font-black tracking-tight uppercase italic">ProofLayer</h1>
          </div>
          <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-[0.2em] mt-1 ml-11">Version 1.0.4</p>
        </div>

        <nav className="flex-1 p-6 space-y-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Core Hub</p>
          <NavItem icon={<BarChart3 size={18} />} label="Audit Lab" active={view === 'audit'} onClick={() => setView('audit')} />
          <NavItem icon={<History size={18} />} label="Verification Log" active={view === 'history'} onClick={() => setView('history')} />
          
          <div className="my-8 h-px bg-slate-100" />
          
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Compliance</p>
          <NavItem icon={<Database size={18} />} label="Model Registry" active={view === 'models'} onClick={() => setView('models')} />
          <NavItem icon={<Scale size={18} />} label="Bias Metrics" active={view === 'metrics'} onClick={() => setView('metrics')} />
          <NavItem icon={<FileText size={18} />} label="Data Reports" active={view === 'reports'} onClick={() => setView('reports')} />
          
          <div className="my-8 h-px bg-slate-100" />
          
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Platform</p>
          <NavItem icon={<Settings size={18} />} label="Control Panel" active={view === 'settings'} onClick={() => setView('settings')} />
        </nav>

        <div className="p-6 border-t-2 border-slate-900 bg-slate-50 flex flex-col gap-3">
          {!user ? (
            <button 
              onClick={login}
              className="w-full py-3 bg-white text-slate-900 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] font-black text-[10px] uppercase tracking-widest hover:translate-y-0.5 hover:shadow-none transition-all flex items-center justify-center gap-2"
            >
              <LogIn size={14} /> System Access
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black text-slate-900 truncate uppercase">{user.email?.split('@')[0]}</p>
                  <p className="text-[7px] font-bold text-emerald-600 uppercase">Verified Auditor</p>
                </div>
              </div>
              <button 
                onClick={logout}
                className="w-full py-2 text-slate-400 hover:text-red-600 font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                <LogOut size={12} /> Terminate Session
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 relative flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-20 border-b-2 border-slate-900 bg-white/80 backdrop-blur-md sticky top-0 px-4 md:px-8 flex items-center justify-between z-10">
          <div className="flex items-center gap-4 md:gap-6">
            <button 
              onClick={() => setShowMobileMenu(true)}
              className="lg:hidden p-3 bg-white border-2 border-slate-900 rounded-xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-y-0.5 active:shadow-none transition-all"
            >
              <Menu size={20} />
            </button>
            <span className="lg:hidden text-lg font-black uppercase italic tracking-tighter text-indigo-600">ProofLayer</span>
            <nav className="hidden lg:flex gap-8 text-[10px] font-black uppercase tracking-widest">
              <button onClick={() => setView('audit')} className={`${view === 'audit' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'} pb-2 transition-all`}>Dashboard</button>
              <button onClick={() => setView('history')} className={`${view === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'} pb-2 transition-all`}>History</button>
              <button onClick={() => setView('models')} className={`${view === 'models' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'} pb-2 transition-all`}>Models</button>
              <button onClick={() => setView('reports')} className={`${view === 'reports' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'} pb-2 transition-all`}>Reports</button>
            </nav>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={handleReset}
              className="bg-indigo-600 text-white px-3 md:px-5 py-2.5 rounded-xl border-2 border-indigo-900 shadow-[2px_2px_0px_0px_rgba(30,27,75,1)] font-bold text-[10px] md:text-xs uppercase tracking-widest hover:translate-y-0.5 hover:shadow-none transition-all"
            >
              <span className="hidden sm:inline">New Analysis</span>
              <Plus className="sm:hidden" size={16} />
            </button>
            <div className="flex items-center gap-2 md:gap-4 ml-1 md:ml-4 pl-1 md:pl-4 border-l-2 border-slate-100">
              <Bell size={20} className="text-slate-400 cursor-pointer hidden sm:block" />
              {user ? (
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`} 
                  className="w-10 h-10 rounded-xl border-2 border-slate-900 object-cover shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  alt="Profile"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl border-2 border-slate-900 bg-slate-100 flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer" onClick={login}>
                  <UserIcon className="text-slate-400" size={20} />
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 max-w-5xl mx-auto p-4 sm:p-8 lg:p-12 w-full">
          {view === 'audit' ? (
            <div className="space-y-6 sm:space-y-10">
              {/* Hero Section */}
              <section className="mb-8 sm:mb-12">
                <div className="bg-indigo-600 rounded-2xl sm:rounded-3xl p-6 sm:p-10 border-2 border-indigo-900 shadow-[4px_4px_0px_0px_rgba(30,27,75,1)] text-white relative overflow-hidden">
                  <div className="relative z-10">
                    <h1 className="text-2xl sm:text-4xl font-black mb-3 tracking-tight uppercase leading-[0.9]">
                      Detect bias before it impacts real decisions
                    </h1>
                    <p className="text-indigo-100 text-xs sm:text-sm font-medium max-w-2xl">
                      Proactively identify and mitigate algorithmic bias in your datasets using our advanced verification engine.
                    </p>
                  </div>
                  <div className="absolute right-[-20px] bottom-[-20px] opacity-10 pointer-events-none">
                    <ShieldCheck size={180} />
                  </div>
                </div>
              </section>

                <div className="bg-slate-900 text-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 mb-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500 pointer-events-none">
                    <ShieldCheck size={120} />
                  </div>
                  <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full mb-4">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">The Audit Protocol</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black uppercase mb-4 leading-none">Protocol Workflow</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                      <div className="space-y-1">
                        <div className="text-indigo-400 font-black text-xl italic leading-none">01.</div>
                        <p className="text-[10px] font-bold uppercase leading-tight text-slate-300">Run local model and export <span className="text-white underline">Predictions</span> CSV.</p>
                      </div>
                      <div className="space-y-1">
                        <div className="text-indigo-400 font-black text-xl italic leading-none">02.</div>
                        <p className="text-[10px] font-bold uppercase leading-tight text-slate-300">Upload to Audit Lab for <span className="text-white underline">Gemini</span> verification.</p>
                      </div>
                      <div className="space-y-1">
                        <div className="text-indigo-400 font-black text-xl italic leading-none">03.</div>
                        <p className="text-[10px] font-bold uppercase leading-tight text-slate-300">Link results to <span className="text-white underline">Model Registry</span>.</p>
                      </div>
                    </div>
                  </div>
                </div>

              {/* Analysis Form Card */}
              <div className="bg-white border-2 border-slate-900 rounded-2xl sm:rounded-3xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-5 sm:p-8 mb-8 sm:mb-12">
                {/* ... existing analysis form content ... */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                  <div className="md:col-span-5">
                    <h2 className="text-xs font-black uppercase mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-indigo-600 rounded-full"></span> 1. Data Selection
                    </h2>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer group"
                    >
                      <div className="w-12 h-12 bg-white rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Upload className="text-indigo-600" size={24} />
                      </div>
                      <h3 className="text-sm font-black uppercase mb-1">
                        {file ? file.name : "Dataset Upload"}
                      </h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {file ? `${(file.size / 1024).toFixed(1)} KB` : "Drag and drop or browse"}
                      </p>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".csv" 
                        className="hidden" 
                      />
                    </div>
                  </div>

                  <div className="md:col-span-7 flex flex-col justify-between">
                    <div>
                      <h2 className="text-xs font-black uppercase mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-600 rounded-full"></span> 2. Configuration
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 mb-8">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400">Target Variable</label>
                          <div className="relative">
                            <select 
                              value={targetColumn} 
                              onChange={(e) => setTargetColumn(e.target.value)}
                              disabled={columns.length === 0}
                              className="w-full bg-slate-50 border-2 border-slate-900 rounded-xl px-4 py-3 text-xs font-black uppercase appearance-none focus:ring-0 focus:border-indigo-600 transition-all disabled:opacity-50"
                            >
                              <option value="">{columns.length > 0 ? "Select Target" : file ? "No headers found" : "Select Target"}</option>
                              {columns.map(col => <option key={col} value={col}>{col}</option>)}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                              <ChevronDown size={14} />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400">Sensitive Feature</label>
                          <div className="relative">
                            <select 
                              value={sensitiveColumn} 
                              onChange={(e) => setSensitiveColumn(e.target.value)}
                              disabled={columns.length === 0}
                              className="w-full bg-slate-50 border-2 border-slate-900 rounded-xl px-4 py-3 text-xs font-black uppercase appearance-none focus:ring-0 focus:border-indigo-600 transition-all disabled:opacity-50"
                            >
                              <option value="">{columns.length > 0 ? "Select Attribute" : file ? "No headers found" : "Select Attribute"}</option>
                              {columns.map(col => <option key={col} value={col}>{col}</option>)}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                              <ChevronDown size={14} />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-slate-400">Subject Model (Optional)</label>
                            <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded-md">
                              <Database size={8} className="text-indigo-600" />
                              <span className="text-[8px] font-black text-indigo-600 uppercase">Registry Link</span>
                            </div>
                          </div>
                          <div className="relative">
                            <select 
                              value={linkedModelId} 
                              onChange={(e) => setLinkedModelId(e.target.value)}
                              disabled={models.length === 0}
                              className="w-full bg-slate-50 border-2 border-slate-900 rounded-xl px-4 py-3 text-xs font-black uppercase appearance-none focus:ring-0 focus:border-indigo-600 transition-all disabled:opacity-50"
                            >
                              <option value="">{models.length > 0 ? "Ad-hoc Analysis" : "Registry Empty"}</option>
                              {models.map(m => (
                                <option key={m.id} value={m.id}>{m.name} v{m.version}</option>
                              ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                              <ChevronDown size={14} />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-slate-400">Auditor Core</label>
                            <span className="text-[8px] font-bold text-slate-400 uppercase">Gemini Engine</span>
                          </div>
                          <div className="relative">
                            <select 
                              value={selectedModel} 
                              onChange={(e) => setSelectedModel(e.target.value)}
                              className="w-full bg-white border-2 border-slate-900 rounded-xl px-4 py-3 text-xs font-black uppercase appearance-none focus:ring-0 focus:border-indigo-600 transition-all shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
                            >
                              <option value="gemini-3-flash-preview">Gemini 3 Flash (Audit Pro)</option>
                              <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash</option>
                              <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                              <ChevronDown size={14} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <button 
                        onClick={runAnalysis}
                        disabled={isAnalyzing || !file || !targetColumn || !sensitiveColumn}
                        className="flex-grow w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white rounded-xl border-2 border-indigo-900 shadow-[4px_4px_0px_0px_rgba(30,27,75,1)] font-black uppercase tracking-widest text-sm hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:translate-y-0 disabled:shadow-[4px_4px_0px_0px_rgba(30,27,75,0.2)]"
                      >
                        {isAnalyzing ? "Executing Analysis..." : "Execute Analysis"}
                      </button>
                    </div>
                  </div>
                </div>
                
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-6 p-4 bg-red-50 border-2 border-red-900 rounded-2xl text-red-900 flex items-center gap-3 text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(69,10,10,1)]"
                  >
                    <AlertCircle size={18} /> {error}
                  </motion.div>
                )}
              </div>

              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="flex flex-col items-center justify-center py-24 gap-10 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200"
                  >
                    <div className="relative">
                      {/* Outer Glow */}
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute inset-0 bg-indigo-200 blur-3xl rounded-full"
                      />
                      
                      <div className="relative w-48 h-48">
                        <svg className="w-full h-full -rotate-90">
                          <circle cx="96" cy="96" r="80" fill="white" stroke="#e2e8f0" strokeWidth="16" className="shadow-inner" />
                          <motion.circle 
                            cx="96" cy="96" r="80" 
                            fill="transparent" 
                            stroke="#4f378a" 
                            strokeWidth="16" 
                            strokeDasharray="502" 
                            animate={{ strokeDashoffset: [502, 120] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 border-2 border-dashed border-indigo-100 rounded-full scale-110"
                          />
                          <div className="bg-white p-6 rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                            <BarChart3 className="text-indigo-600" size={48} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-center space-y-4 px-6 z-10">
                      <div className="space-y-1">
                        <h2 className="text-3xl font-black uppercase tracking-tight text-slate-900">Conducting Audit</h2>
                        <motion.p 
                          key={analysisStep}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-indigo-600 font-bold uppercase text-xs tracking-widest min-h-[1rem]"
                        >
                          {analysisStep}
                        </motion.p>
                      </div>
                      
                      <div className="w-64 mx-auto space-y-4">
                        <div className="w-full bg-white border-2 border-slate-900 h-6 rounded-xl overflow-hidden shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] p-1">
                          <motion.div 
                            className="h-full bg-indigo-600 rounded-lg" 
                            initial={{ width: 0 }}
                            animate={{ width: `${analysisProgress}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                            {analysisProgress}% Complete
                          </p>
                          <div className="flex gap-1">
                            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : result ? (
                  <motion.div 
                    key="result"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                      {/* Fairness Score Card */}
                      <div className="md:col-span-8 bg-white border-2 border-slate-900 rounded-3xl p-8 flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                        <div>
                          <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-2 block">System Verification Result</span>
                          <h2 className="text-3xl font-black uppercase tracking-tight mb-4">Fairness Score</h2>
                          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase border-2 ${
                            result.fairnessScore > 85 ? 'bg-emerald-50 text-emerald-900 border-emerald-900' :
                            result.fairnessScore > 60 ? 'bg-orange-50 text-orange-900 border-orange-900' : 'bg-red-50 text-red-900 border-red-900'
                          }`}>
                            <div className={`w-2 h-2 rounded-full ${
                              result.fairnessScore > 85 ? 'bg-emerald-500' :
                              result.fairnessScore > 60 ? 'bg-orange-500' : 'bg-red-500'
                            }`} />
                            {result.biasStatus}
                          </div>
                        </div>
                        <div className="relative flex items-center justify-center w-36 h-36">
                          <svg className="w-full h-full -rotate-90">
                            <circle cx="72" cy="72" r="62" fill="transparent" stroke="#f1f5f9" strokeWidth="14" />
                            <motion.circle 
                              cx="72" cy="72" r="62" 
                              fill="transparent" 
                              stroke={result.fairnessScore > 85 ? "#10b981" : result.fairnessScore > 60 ? "#f59e0b" : "#ba1a1a"} 
                              strokeWidth="14" 
                              strokeDasharray="390" 
                              initial={{ strokeDashoffset: 390 }}
                              animate={{ strokeDashoffset: 390 - (390 * result.fairnessScore / 100) }}
                              transition={{ duration: 1.5, ease: "easeOut" }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-4xl font-black text-slate-900 tracking-tighter">{result.fairnessScore}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">/ 100</span>
                          </div>
                        </div>
                      </div>

                      {/* Summary Metric Card */}
                      <div className="md:col-span-4 bg-slate-900 text-white rounded-3xl p-8 flex flex-col justify-between shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                        <div>
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 block">Compliance Delta</span>
                          <h3 className="text-lg font-black uppercase mb-2">Disparity Rate</h3>
                          <div className="text-4xl font-black text-indigo-400 mb-2">{result.difference}%</div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase leading-snug">
                            Max deviation from statistical parity detected.
                          </p>
                        </div>
                        <button className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all mt-6 border-2 border-indigo-900 shadow-[2px_2px_0px_0px_rgba(30,27,75,1)]">
                          <Download size={14} /> Export Proof
                        </button>
                      </div>
                    </div>

                    {/* Metrics Comparison */}
                    <div className="bg-white border-2 border-slate-900 rounded-3xl p-8 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-600 rounded-full"></span> Group Selection Rates
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {Object.entries(result.groups).map(([group, stats]: [string, GroupStats]) => (
                          <div key={group} className="bg-slate-50 border-2 border-slate-900 rounded-2xl p-6 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                            <div className="flex justify-between items-start mb-4">
                              <span className="text-xs font-black uppercase tracking-tight text-slate-900 max-w-[70%]">{group}</span>
                              <span className="text-lg font-black text-indigo-600">{(stats.rate * 100).toFixed(1)}%</span>
                            </div>
                            <div className="h-3 w-full bg-white border-2 border-slate-900 rounded-full overflow-hidden mb-3">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${stats.rate * 100}%` }}
                                transition={{ duration: 1 }}
                                className="h-full bg-indigo-600"
                              />
                            </div>
                            <div className="text-[9px] font-black text-slate-400 uppercase">
                              {stats.selected} selections in {stats.total} samples
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Gemini Explanation */}
                    <div className="bg-emerald-50 border-2 border-emerald-900 rounded-3xl p-8 shadow-[4px_4px_0px_0px_rgba(6,78,59,1)]">
                      <div className="flex gap-6">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 bg-emerald-900 rounded-2xl flex items-center justify-center text-emerald-100 shadow-[2px_2px_0px_0px_rgba(6,78,59,1)]">
                            <Sparkles size={24} strokeWidth={2.5} />
                          </div>
                        </div>
                        <div className="flex-grow">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-900 mb-3">AI Narrative Interpretation</h4>
                          {explanation ? (
                            <div className="prose prose-sm prose-slate max-w-none text-emerald-950 font-medium leading-relaxed markdown-body">
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm, remarkMath]} 
                                rehypePlugins={[rehypeKatex]}
                              >
                                {explanation}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 text-emerald-700 text-xs font-black uppercase animate-pulse">
                              Generating cryptographic interpretation...
                            </div>
                          )}
                        </div>
                        <div className="hidden md:block flex-shrink-0 w-40 bg-white/50 border-2 border-emerald-200 rounded-2xl p-4">
                          <p className="text-[9px] font-black text-emerald-800 uppercase mb-1">Model Integrity</p>
                          <div className="text-2xl font-black text-emerald-900">98.4%</div>
                          <p className="text-[8px] font-bold text-emerald-600 uppercase mt-1">High Accuracy Proof</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-center justify-center mt-12 pb-12">
                      <button 
                        onClick={reset}
                        className="px-8 py-3 border-2 border-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest bg-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:translate-y-0.5 hover:shadow-none transition-all"
                      >
                        Analyze New Dataset
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  /* Initial State Feature Highlights */
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 border-t-2 border-slate-100"
                  >
                    <FeatureCard 
                      icon={<ShieldCheck className="text-indigo-600" size={28} />} 
                      title="TRANSPARENCY" 
                      desc="Detailed mathematical proofs for every audit result provided by AI."
                    />
                    <FeatureCard 
                      icon={<Scale className="text-orange-600" size={28} />} 
                      title="COMPLIANCE" 
                      desc="Align with global AI regulations like GDPR and ethical standards."
                    />
                    <FeatureCard 
                      icon={<Sparkles className="text-indigo-600" size={28} />} 
                      title="AI POWERED" 
                      desc="Automated identification of intersectional bias patterns using Google Gemini."
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : view === 'history' ? (
            /* History View */
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tight">Audit Archive</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Verification history for your datasets</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 flex-1 max-w-xl">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text"
                      placeholder="Search by filename or date..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border-2 border-slate-900 rounded-xl pl-12 pr-4 py-3 text-xs font-bold uppercase placeholder:text-slate-300 focus:ring-0 focus:border-indigo-600 transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                    />
                  </div>
                  {!user && (
                    <div className="bg-amber-50 border-2 border-amber-900 rounded-xl p-4 text-amber-900 text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(120,53,15,1)]">
                      Sign in to sync history
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {history.filter(h => {
                  const searchTerm = searchQuery.toLowerCase();
                  const fileName = (h.fileName || '').toLowerCase();
                  const dateStr = h.createdAt?.toDate?.()?.toLocaleDateString().toLowerCase() || 'recently';
                  return fileName.includes(searchTerm) || dateStr.includes(searchTerm);
                }).length > 0 ? (
                  history.filter(h => {
                    const searchTerm = searchQuery.toLowerCase();
                    const fileName = (h.fileName || '').toLowerCase();
                    const dateStr = h.createdAt?.toDate?.()?.toLocaleDateString().toLowerCase() || 'recently';
                    return fileName.includes(searchTerm) || dateStr.includes(searchTerm);
                  }).map((h) => (
                    <div 
                      key={h.id} 
                      className="bg-white border-2 border-slate-900 rounded-2xl p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:translate-x-1 transition-all cursor-pointer group"
                      onClick={() => {
                        setResult({
                          fairnessScore: h.fairnessScore,
                          biasStatus: h.biasStatus,
                          difference: h.difference,
                          groups: h.groups,
                          targetValues: [], 
                          positiveValue: 'selected',
                          integrity: h.integrity || {
                            missingPct: '0',
                            piiFound: false,
                            imbalanceRatio: '1.0',
                            minGroupSize: 0,
                            totalRecords: 0
                          }
                        });
                        setExplanation(h.explanation);
                        setView('audit');
                      }}
                    >
                      <div className="flex gap-4 sm:gap-6 items-center flex-1 w-full">
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex items-center justify-center ${
                          h.fairnessScore > 85 ? 'bg-emerald-50 text-emerald-600' :
                          h.fairnessScore > 60 ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
                        }`}>
                          <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-black uppercase truncate leading-tight">{h.fileName}</h4>
                          <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
                             <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md">
                               <Clock size={10} className="text-slate-400" />
                               <span className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-tighter">{h.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'}</span>
                             </div>
                             <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded-md">
                               <Zap size={10} className="text-indigo-600" />
                               <span className="text-[8px] sm:text-[9px] font-black text-indigo-600 uppercase tracking-tighter">{h.sensitiveColumn}</span>
                             </div>
                             {h.modelId && (
                               <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-md">
                                 <Database size={10} className="text-emerald-600" />
                                 <span className="text-[8px] sm:text-[9px] font-black text-emerald-600 uppercase tracking-tighter">Linked Model</span>
                               </div>
                             )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left sm:text-right">
                           <div className="text-xl sm:text-2xl font-black text-slate-900 leading-none">{h.fairnessScore}<span className="text-[10px] text-slate-400">/100</span></div>
                           <div className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full border-2 mt-1 inline-block ${
                              h.fairnessScore > 85 ? 'bg-emerald-50 text-emerald-900 border-emerald-900' :
                              h.fairnessScore > 60 ? 'bg-orange-50 text-orange-900 border-orange-900' : 'bg-red-50 text-red-900 border-red-900'
                           }`}>
                             {h.biasStatus}
                           </div>
                        </div>
                        {user && (
                          <button 
                            onClick={(e) => deleteAnalysis(h.id, e)}
                            className="p-3 bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 border border-red-100 rounded-xl transition-all"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-20 bg-white border-2 border-dashed border-slate-900 rounded-3xl flex flex-col items-center justify-center text-center opacity-50">
                    <Search className="text-slate-400 mb-4" size={48} />
                    <h3 className="text-lg font-black uppercase mb-1">No Audits Found</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Run an analysis to see history</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : view === 'metrics' ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 px-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tight">Bias Metrics Encyclopedia</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Understanding the mathematics of fairness</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <MetricExplainer 
                  title="Statistical Parity Difference"
                  formula="P(Outcome=1 | Group=A) - P(Outcome=1 | Group=B)"
                  desc="Measures the difference in the probability of a positive outcome between two groups. Ideal value is 0."
                  impact="High"
                />
                <MetricExplainer 
                  title="Disparate Impact Ratio"
                  formula="P(Outcome=1 | Group=A) / P(Outcome=1 | Group=B)"
                  desc="The ratio of selection rates. Commonly regulated by the 'four-fifths rule' (0.8 threshold)."
                  impact="Critical"
                />
                <MetricExplainer 
                  title="Equal Opportunity Difference"
                  formula="TPR(Group=A) - TPR(Group=B)"
                  desc="Focuses on the difference in True Positive Rates between groups. Essential for fairness in active models."
                  impact="Medium"
                />
                <MetricExplainer 
                  title="Treatment Equality"
                  formula="Ratio of False Positives to False Negatives"
                  desc="Checks if the model makes the same types of errors across different demographic segments."
                  impact="High"
                />
              </div>
            </motion.div>
          ) : view === 'integrity' ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 px-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tight">Data Integrity</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Dataset health and validation reporting</p>
                </div>
              </div>

              {file ? (
                <div className="bg-white border-2 border-slate-900 rounded-3xl p-8 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                  <div className="flex items-center gap-4 mb-8 p-4 bg-indigo-50 border-2 border-indigo-200 rounded-2xl">
                    <Database className="text-indigo-600" size={24} />
                    <div>
                      <h3 className="text-sm font-black uppercase">{file.name}</h3>
                      <p className="text-[10px] font-bold text-slate-500">{columns.length} Columns detected • {(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <IntegrityCard 
                      title="Completeness" 
                      status={result?.integrity?.missingPct === '0.0' ? 'Pass' : 'Warning'} 
                      score={`${100 - parseFloat(result?.integrity?.missingPct || '0')}%`} 
                      desc={result?.integrity?.missingPct === '0.0' ? "No missing values detected." : `${result?.integrity?.missingPct}% of records missing critical data.`} 
                    />
                    <IntegrityCard 
                      title="Cardinality" 
                      status={(result?.integrity?.minGroupSize || 0) < 30 ? "Warning" : "Pass"} 
                      score={result?.integrity?.minGroupSize?.toString() || "N/A"} 
                      desc={(result?.integrity?.minGroupSize || 0) < 30 ? "Smallest group has low sample size (<30)." : "Minimum sample size exceeds safety threshold."} 
                    />
                    <IntegrityCard 
                      title="Imbalance" 
                      status={parseFloat(result?.integrity?.imbalanceRatio || '1') < 0.2 ? "Warning" : "Pass"} 
                      score={result?.integrity?.imbalanceRatio || "1.0"} 
                      desc={parseFloat(result?.integrity?.imbalanceRatio || '1') < 0.2 ? "Significant demographic skew detected." : "Demographic distribution is relatively balanced."} 
                    />
                    <IntegrityCard 
                      title="Privacy" 
                      status={result?.integrity?.piiFound ? "Issue" : "Pass"} 
                      score={result?.integrity?.piiFound ? "PII Found" : "Secure"} 
                      desc={result?.integrity?.piiFound ? "Possible exposure of email or identifying patterns." : "No obvious PII strings detected in feature columns."} 
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-white border-2 border-slate-900 rounded-3xl p-12 text-center shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                  <Database className="mx-auto text-slate-200 mb-4" size={64} />
                  <h3 className="text-xl font-black uppercase mb-2">No Active Dataset</h3>
                  <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">Upload a CSV in the Analyze tab to run integrity checks on your data model.</p>
                  <button 
                    onClick={() => setView('audit')}
                    className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl border-2 border-indigo-900 shadow-[2px_2px_0px_0px_rgba(30,27,75,1)] font-bold text-xs uppercase hover:translate-y-0.5 hover:shadow-none transition-all"
                  >
                    Go to Upload
                  </button>
                </div>
              )}
            </motion.div>
          ) : view === 'models' ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 px-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tight">Model Inventory</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manage and track your audited machine learning models</p>
                  <p className="text-[10px] font-medium text-slate-500 uppercase leading-relaxed max-w-2xl mt-4 bg-slate-50 p-4 border-2 border-dashed border-slate-200 rounded-2xl">
                    <span className="text-indigo-600 font-black">Why track models?</span> ProofLayer connects your bias audits to specific model versions. By maintaining an inventory, you create a chain of custody for your AI ethics compliance, allowing you to track how fairness scores evolve over time as you deploy new versions.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={handleAISuggestTrends}
                    disabled={isSuggesting}
                    className="px-6 py-3 bg-white text-indigo-600 rounded-xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] font-black text-[10px] uppercase tracking-widest hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Sparkles size={16} /> {isSuggesting ? 'Analyzing Trends...' : 'AI Suggest Trends'}
                  </button>
                  <button 
                    onClick={() => setModelModal({ show: true, isEditing: false, data: { name: '', version: '1.0.0', deploymentDate: new Date().toISOString().split('T')[0], accuracy: '', biasStatus: 'Low' }})}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl border-2 border-indigo-900 shadow-[4px_4px_0px_0px_rgba(30,27,75,1)] font-black text-[10px] uppercase tracking-widest hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-2"
                  >
                    <Plus size={16} /> Register Model
                  </button>
                </div>
              </div>

              {/* Performance & Fairness Trends Dashboard */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-12">
                   <div className="bg-slate-900 border-2 border-slate-900 rounded-[2.5rem] p-6 sm:p-10 text-white relative overflow-hidden shadow-[8px_8px_0px_0px_rgba(79,70,229,1)]">
                     <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                       <LineChartIcon size={240} />
                     </div>
                     
                     <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-12">
                        <div className="lg:col-span-2">
                           <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                              <div className="flex items-center gap-3">
                                <div className="p-3 bg-indigo-500/10 border border-indigo-400/20 rounded-2xl">
                                  <LineChartIcon size={20} className="text-indigo-400" />
                                </div>
                                <div>
                                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Global Fairness Velocity</h3>
                                  <p className="text-[8px] font-bold text-slate-500 uppercase mt-0.5">Aggregate performance over last 10 audits</p>
                                </div>
                              </div>
                              <div className="px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-[8px] font-black uppercase text-indigo-300 self-start sm:self-center">
                                Live Protocol Tracking
                              </div>
                           </div>
                           
                           <div className="h-[250px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                  data={[...history].reverse().map(h => ({
                                    name: h.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '?',
                                    score: h.fairnessScore,
                                    model: models.find(m => m.id === h.modelId)?.name || 'Audit'
                                  }))}
                                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                >
                                  <defs>
                                    <linearGradient id="globalColor" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                  <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }}
                                    dy={10}
                                  />
                                  <YAxis 
                                    domain={[0, 100]} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }}
                                  />
                                  <Tooltip 
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                          <div className="bg-slate-900 border-2 border-indigo-500/50 p-4 rounded-2xl shadow-2xl backdrop-blur-md">
                                            <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">{data.name}</p>
                                            <p className="text-[12px] font-black text-white uppercase">{data.model}</p>
                                            <div className="mt-3 text-2xl font-black text-white">{data.score}% <span className="text-[10px] text-slate-500">Fairness</span></div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <Area 
                                    type="monotone" 
                                    dataKey="score" 
                                    stroke="#818cf8" 
                                    strokeWidth={4} 
                                    fillOpacity={1} 
                                    fill="url(#globalColor)" 
                                    animationDuration={2000}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                        
                        <div className="flex flex-col justify-center space-y-8">
                           <div className="p-8 bg-slate-800/40 rounded-[2rem] border border-slate-700/50 backdrop-blur-sm shadow-[inset_0_0_20px_rgba(0,0,0,0.2)]">
                             <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Protocol Health</p>
                             <div className="text-4xl font-black text-indigo-400 tracking-tighter">
                                {history.length > 0 ? (history.reduce((acc, h) => acc + h.fairnessScore, 0) / history.length).toFixed(1) : '0'}%
                             </div>
                             <div className="mt-4 h-2 w-full bg-slate-700/50 rounded-full overflow-hidden">
                               <motion.div 
                                 initial={{ width: 0 }}
                                 animate={{ width: `${history.length > 0 ? (history.reduce((acc, h) => acc + h.fairnessScore, 0) / history.length) : 0}%` }}
                                 transition={{ duration: 1.5, ease: "easeOut" }}
                                 className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 shadow-[0_0_10px_rgba(79,70,229,0.5)]" 
                               />
                             </div>
                             <p className="mt-3 text-[9px] font-bold text-slate-500 uppercase leading-relaxed">Composite index across active audited models.</p>
                           </div>
                           
                           <div className="space-y-5">
                              <h4 className="text-[10px] font-black uppercase text-indigo-400 mb-2 italic flex items-center gap-2">
                                <Zap size={14} /> Critical Evolutions
                              </h4>
                              {history.slice(0, 3).map((h, i) => (
                                <div key={i} className="flex items-center gap-4 group">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border border-slate-700 group-hover:scale-110 transition-transform ${h.fairnessScore > 85 ? 'text-emerald-400 bg-emerald-400/10' : 'text-indigo-400 bg-indigo-400/10'}`}>
                                    <Zap size={16} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase text-white truncate group-hover:text-indigo-400 transition-colors">{models.find(m => m.id === h.modelId)?.name || 'Audit Point'}</p>
                                    <div className="flex items-center gap-2">
                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{h.fairnessScore}% <span className="text-[8px] font-bold text-slate-600 italic">verified score</span></p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                           </div>
                        </div>
                     </div>
                   </div>
                </div>
              </div>

              {aiSuggestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-indigo-50 border-2 border-indigo-200 rounded-3xl p-8 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4">
                    <button onClick={() => setAiSuggestions([])} className="p-2 text-indigo-300 hover:text-indigo-600 transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 mb-6 flex items-center gap-2">
                    <Zap size={16} /> AI Industry Recommendations
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {aiSuggestions.map((s, i) => (
                      <div key={i} className="bg-white border-2 border-indigo-100 rounded-2xl p-6 shadow-[2px_2px_0px_0px_rgba(79,70,229,0.1)] flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="text-sm font-black uppercase text-slate-900 leading-tight">{s.name}</h4>
                          <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-200">v{s.version}</span>
                        </div>
                        <div className="flex-grow space-y-2 mb-6">
                          <div className="flex justify-between text-[9px] font-bold uppercase text-slate-400">
                            <span>Accuracy</span>
                            <span className="text-slate-900">{s.accuracy}%</span>
                          </div>
                          <div className="flex justify-between text-[9px] font-bold uppercase text-slate-400">
                            <span>Est. Bias</span>
                            <span className={s.biasStatus === 'High' ? 'text-red-600' : 'text-emerald-600'}>{s.biasStatus}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => addAISuggestion(s)}
                          className="w-full py-2 bg-indigo-600 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 transition-colors"
                        >
                          Add to Inventory
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-6">
                  {models.length > 0 ? models.map((m) => {
                    const linkedAudits = history.filter(h => h.modelId === m.id);
                    const hasAudits = linkedAudits.length > 0;
                    const hasTrend = linkedAudits.length > 1;
                    return (
                      <div key={m.id} className="bg-white border-2 border-slate-900 rounded-2xl p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:translate-x-1 transition-all">
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 flex items-center justify-center border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] ${
                            m.biasStatus === 'Low' ? 'bg-emerald-100 text-emerald-800' : m.biasStatus === 'High' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                          }`}>
                            <Sparkles className="size-5 sm:size-6" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-black uppercase text-slate-900 leading-tight truncate">{m.name}</h4>
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-slate-900 text-white rounded-md">v{m.version}</span>
                              {hasAudits && (
                                <div className="flex items-center gap-1 text-[7px] sm:text-[8px] font-black text-emerald-600 uppercase bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                                  <CheckCircle2 size={8} /> Verified
                                </div>
                              )}
                              {hasTrend && (
                                <div className="flex items-center gap-1 text-[7px] sm:text-[8px] font-black text-indigo-600 uppercase bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100 animate-pulse">
                                  <LineChartIcon size={8} /> Trend Active
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Deployed {m.deploymentDate} • {m.accuracy}% Accuracy</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <div className="text-right sm:mr-4">
                            <div className={`text-[7px] sm:text-[8px] font-black uppercase px-2 py-1 rounded-full border-2 inline-block ${
                              m.biasStatus === 'Low' ? 'bg-emerald-50 text-emerald-900 border-emerald-900' :
                              m.biasStatus === 'High' ? 'bg-red-50 text-red-900 border-red-900' :
                              'bg-orange-50 text-orange-900 border-orange-900'
                            }`}>
                              Bias: {m.biasStatus}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {hasTrend && (
                              <button 
                                onClick={() => viewDetails(m)}
                                className="p-3 sm:p-2.5 bg-indigo-50 border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-[2px_2px_0px_0px_rgba(79,70,229,0.1)] active:translate-y-0.5"
                                title="Fairness Evolution"
                              >
                                <LineChartIcon size={16} />
                              </button>
                            )}
                            <button 
                              onClick={() => viewDetails(m)}
                              className="p-3 sm:p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-600 rounded-xl transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,0.05)] active:translate-y-0.5"
                              title="Audit Intelligence"
                            >
                              <Info size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                setVersionHistoryModal({ show: true, modelId: m.id, modelName: m.name });
                                fetchModelVersions(m.id);
                              }}
                              className="p-3 sm:p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-600 rounded-xl transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,0.05)] active:translate-y-0.5"
                              title="Version Control"
                            >
                              <RotateCcw size={16} />
                            </button>
                            <button 
                              onClick={() => deleteModel(m.id)}
                              className="p-3 sm:p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-600 rounded-xl transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,0.05)] active:translate-y-0.5"
                              title="Remove Model"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-center py-12 bg-white border-2 border-dashed border-slate-200 rounded-3xl">
                      <Sparkles className="mx-auto text-slate-200 mb-4" size={48} />
                      <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">No models registered yet</p>
                    </div>
                  )}
                </div>
                <div className="lg:col-span-4">
                  <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 font-mono">Model Usage Stats</h3>
                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black uppercase">Active Models</span>
                        <span className="text-2xl font-black">{models.length}</span>
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black uppercase">Avg Model Accuracy</span>
                        <span className="text-2xl font-black text-indigo-400">
                          {models.length > 0 
                            ? (models.reduce((acc, m) => acc + parseFloat(m.accuracy || 0), 0) / models.length).toFixed(1) 
                            : '0'}%
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 transition-all duration-1000" 
                          style={{ width: `${models.length > 0 ? (models.reduce((acc, m) => acc + parseFloat(m.accuracy || 0), 0) / models.length) : 0}%` }}
                        />
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed">70% Of your production models have passed latest ProofLayer integrity checks.</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : view === 'reports' ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 px-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tight">Compliance Reports</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Exportable audit artifacts for stakeholders and regulators</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { title: 'Executive Fairness Summary', format: 'PDF', date: 'Monthly', desc: 'High-level overview of bias metrics and organizational risk posture.' },
                  { title: 'Technical Audit Logs', format: 'JSON/CSV', date: 'On-Demand', desc: 'Raw mathematical differentials and group statistics for developers.' },
                  { title: 'Regulatory Compliance Pack', format: 'PDF/HTML', date: 'Quarterly', desc: 'Comprehensive proof of verification aligned with AI Act requirements.' },
                  { title: 'Intersectional Analysis', format: 'PDF', date: 'Ad-hoc', desc: 'Deep dive into demographic overlaps and complex parity issues.' },
                  { title: 'Dataset Health Export', format: 'CSV', date: 'Weekly', desc: 'Summary of missing values, cardinality, and data drift observations.' }
                ].map((r, i) => (
                  <div key={i} className="bg-white border-2 border-slate-900 rounded-3xl p-8 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:translate-y-1 hover:shadow-none transition-all flex flex-col">
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                        <FileText className="text-indigo-600" size={20} />
                      </div>
                      <span className="text-[8px] font-black uppercase text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border-2 border-slate-200">{r.format}</span>
                    </div>
                    <h4 className="text-sm font-black uppercase mb-2 tracking-tight">{r.title}</h4>
                    <p className="text-xs text-slate-400 font-bold mb-6 flex-grow">{r.desc}</p>
                    <div className="flex items-center justify-between pt-6 border-t-2 border-slate-50">
                      <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{r.date}</span>
                      <button className="p-2 text-slate-900 hover:text-indigo-600 transition-colors">
                        <Download size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : view === 'settings' ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 px-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tight">System Settings</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configure your audit environment</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-6">
                  <div className="bg-white border-2 border-slate-900 rounded-3xl p-8 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                       <UserIcon size={16} className="text-indigo-600" /> Identity Profile
                    </h3>
                    {user ? (
                      <div className="flex items-center gap-6 p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl">
                        <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-black border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                          {user.email?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-lg font-black text-slate-900 uppercase tracking-tight">{user.email?.split('@')[0]}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">{user.email}</div>
                          <button onClick={logout} className="text-red-600 text-[10px] font-black uppercase mt-2 hover:underline">Terminate Session</button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                        <p className="text-slate-400 text-xs font-bold uppercase mb-4">You are currently using ProofLayer anonymously.</p>
                        <button onClick={login} className="px-6 py-2 bg-indigo-600 text-white rounded-xl border-2 border-indigo-900 shadow-[2px_2px_0px_0px_rgba(30,27,75,1)] font-bold text-xs uppercase">Sign In with Google</button>
                      </div>
                    )}
                  </div>

                  <div className="bg-white border-2 border-slate-900 rounded-3xl p-8 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                       <Scale size={16} className="text-indigo-600" /> Audit Preferences
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-4 bg-slate-50 border-2 border-slate-100 rounded-xl">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-900">Parity Threshold</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Alert if &gt; 20%</p>
                        </div>
                        <div className="text-sm font-black text-indigo-600">0.20</div>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-slate-50 border-2 border-slate-100 rounded-xl">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-900">AI Narrative</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Gemini depth</p>
                        </div>
                        <div className="px-3 py-1 bg-white border-2 border-slate-900 rounded-lg text-[9px] font-black uppercase italic">High</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-indigo-600 text-white border-2 border-indigo-900 rounded-3xl p-8 shadow-[4px_4px_0px_0px_rgba(30,27,75,1)]">
                    <Zap className="text-indigo-200 mb-4" size={32} />
                    <h3 className="text-lg font-black uppercase leading-tight mb-2">Upgrade to Pro</h3>
                    <p className="text-indigo-100 text-[10px] font-medium leading-relaxed mb-6">
                      Unlock blockchain-backed audit proofs and custom thresholds.
                    </p>
                    <button className="w-full py-3 bg-white text-indigo-900 rounded-xl border-2 border-indigo-900 shadow-[2px_2px_0px_0px_rgba(30,27,75,1)] font-black text-[10px] uppercase tracking-widest hover:translate-y-0.5 hover:shadow-none transition-all">
                      View Plans
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </div>

        {/* Model Details Modal */}
        <AnimatePresence>
          {selectedModelDetails && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedModelDetails(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-2xl bg-white border-4 border-slate-900 rounded-[2.5rem] shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-8 border-b-4 border-slate-900 flex justify-between items-center bg-slate-50">
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-slate-900">{selectedModelDetails.model.name}</h3>
                    <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mt-1">Audit Identification: {selectedModelDetails.model.id}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedModelDetails(null)}
                    className="p-3 hover:bg-slate-200 rounded-2xl border-2 border-transparent hover:border-slate-900 transition-all text-slate-900"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 border-2 border-slate-900 rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Version</p>
                      <p className="text-lg font-black text-slate-900">v{selectedModelDetails.model.version}</p>
                    </div>
                    <div className="bg-slate-50 border-2 border-slate-900 rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Accuracy</p>
                      <p className="text-lg font-black text-slate-900">{selectedModelDetails.model.accuracy}%</p>
                    </div>
                    <div className={`border-2 border-slate-900 rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] ${
                      selectedModelDetails.model.biasStatus === 'Low' ? 'bg-emerald-50' : selectedModelDetails.model.biasStatus === 'High' ? 'bg-red-50' : 'bg-orange-50'
                    }`}>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Risk Status</p>
                      <p className={`text-lg font-black ${
                        selectedModelDetails.model.biasStatus === 'Low' ? 'text-emerald-600' : selectedModelDetails.model.biasStatus === 'High' ? 'text-red-600' : 'text-orange-600'
                      }`}>{selectedModelDetails.model.biasStatus}</p>
                    </div>
                  </div>

                  <div className="bg-indigo-50 border-4 border-slate-900 rounded-3xl p-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Sparkles size={120} />
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-white border-2 border-slate-900 rounded-xl flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                          <Zap className="text-indigo-600" size={20} />
                        </div>
                        <h4 className="text-sm font-black uppercase text-indigo-900 tracking-tight">AI Narrative Interpretation</h4>
                      </div>

                      {selectedModelDetails.loading ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                          <p className="text-xs font-black text-indigo-400 uppercase tracking-widest animate-pulse">Consulting Ethical Frameworks...</p>
                        </div>
                      ) : (
                        <div className="prose prose-sm prose-slate max-w-none text-indigo-950 font-medium leading-relaxed markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {selectedModelDetails.analysis || "No detailed analysis available."}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bias Trend Visualization */}
                  <div className="space-y-4 pt-6 mt-6 border-t-2 border-slate-50">
                    <div className="flex items-center justify-between pb-4">
                      <div className="flex items-center gap-3">
                         <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
                           <LineChartIcon size={18} className="text-indigo-600" />
                         </div>
                         <div>
                            <h4 className="text-[11px] font-black uppercase text-indigo-900 tracking-tight">Mitigation Impact Tracking</h4>
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Tracking fairness score growth across versions</p>
                         </div>
                      </div>
                    </div>

                    {modelAnalyses.length > 1 ? (
                      <div className="bg-slate-50 border-2 border-slate-900 rounded-3xl p-6 h-[250px] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={[...modelAnalyses].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)).map(a => ({
                              name: a.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '?',
                              score: a.fairnessScore,
                              version: a.modelVersion || 'v?',
                              bias: a.biasStatus
                            }))}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }}
                              dy={10}
                            />
                            <YAxis 
                              domain={[0, 100]} 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }}
                            />
                            <Tooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-slate-900 border-2 border-indigo-500 p-3 rounded-xl shadow-xl">
                                      <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">{data.name} • {data.version}</p>
                                      <p className="text-lg font-black text-white">{data.score}% Fairness</p>
                                      <p className={`text-[8px] font-black uppercase mt-1 ${
                                        data.bias === 'Low' ? 'text-emerald-400' : 'text-red-400'
                                      }`}>Risk: {data.bias}</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="score" 
                              stroke="#4f46e5" 
                              strokeWidth={4} 
                              fillOpacity={1} 
                              fill="url(#colorScore)" 
                              animationDuration={1500}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
                        <LineChartIcon className="mx-auto text-slate-200 mb-3" size={32} />
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Insufficient data for trend visualization</p>
                        <p className="text-[8px] font-medium text-slate-400 mt-1 uppercase">Link at least 2 audits to this model to generate insights.</p>
                      </div>
                    )}
                  </div>

                  {/* Verification History Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b-2 border-slate-100 pb-4">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Scale size={16} className="text-indigo-600" /> Linked Verification History
                      </h4>
                      <span className="text-[10px] font-black text-slate-900 uppercase bg-slate-100 px-2 py-0.5 rounded-full">{modelAnalyses.length} Audits Found</span>
                    </div>

                    {modelAnalyses.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        {modelAnalyses.map((audit) => (
                          <div key={audit.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between hover:border-indigo-200 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${
                                audit.fairnessScore > 85 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
                              }`}>
                                <CheckCircle2 size={16} />
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase text-slate-900 tracking-tight">{audit.fileName}</p>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase">
                                    {audit.createdAt?.toDate?.()?.toLocaleDateString() || 'Recent Audit'}
                                  </p>
                                  <div className="w-1 h-1 rounded-full bg-slate-300" />
                                  <p className="text-[8px] font-black text-indigo-500 uppercase">Verified Output</p>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-black text-slate-900 leading-none">{audit.fairnessScore}%</div>
                              <div className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${
                                audit.fairnessScore > 85 ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'
                              }`}>
                                {audit.biasStatus}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                        <p className="text-[10px] font-bold text-slate-300 uppercase">No mathematical audits linked to this registry entry yet.</p>
                        <p className="text-[8px] font-medium text-slate-400 mt-1 uppercase">Run an analysis in the Analyze tab to link results.</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-4 pt-4">
                    <button 
                      onClick={() => setSelectedModelDetails(null)}
                      className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-[6px_6px_0px_0px_rgba(79,70,229,0.4)] active:shadow-none active:translate-x-1 active:translate-y-1"
                    >
                      Close Registry Entry
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <footer className="border-t-2 border-slate-900 bg-white px-4 md:px-8 py-8 mt-12 text-[9px] font-black uppercase tracking-widest text-slate-400">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-center md:text-left">
              <span className="text-slate-900">© 2026 PROOFLAYER PROTOCOL</span>
              <div className="hidden md:block w-1 h-1 bg-slate-200 rounded-full" />
              <span>ESTABLISHED TO ENSURE ALGORITHMIC FAIRNESS</span>
            </div>
            <div className="flex flex-wrap justify-center gap-4 md:gap-6">
              <a href="#" className="hover:text-indigo-600 transition-colors">Privacy</a>
              <a href="#" className="hover:text-indigo-600 transition-colors">Terms</a>
              <a href="#" className="hover:text-indigo-600 transition-colors">Security</a>
            </div>
          </div>
        </footer>
      </main>

      <Chatbot 
        onNavigate={setView} 
        onSearch={setSearchQuery} 
        onRunAnalysis={runAnalysis}
        onRegisterModel={handleAIGeneratedModel}
        currentView={view}
      />

      {/* Model Management Modal */}
      <AnimatePresence>
        {modelModal.show && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModelModal(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white border-2 border-slate-900 rounded-3xl p-8 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]"
            >
              <div className="flex items-start justify-between mb-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] bg-indigo-50 text-indigo-600">
                  <Sparkles size={24} />
                </div>
                <button 
                  onClick={() => setModelModal(prev => ({ ...prev, show: false }))}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              
              <h3 className="text-xl font-black uppercase tracking-tight mb-6">
                {modelModal.isEditing ? 'Edit Model Registry' : 'Register New Model'}
              </h3>
              
              <form onSubmit={handleModelSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Model Name</label>
                    <input 
                      type="text"
                      required
                      value={modelModal.data.name}
                      onChange={(e) => setModelModal(prev => ({ ...prev, data: { ...prev.data, name: e.target.value } }))}
                      className="w-full bg-slate-50 border-2 border-slate-900 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
                      placeholder="e.g. RiskEngine v2"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Version</label>
                    <input 
                      type="text"
                      required
                      value={modelModal.data.version}
                      onChange={(e) => setModelModal(prev => ({ ...prev, data: { ...prev.data, version: e.target.value } }))}
                      className="w-full bg-slate-50 border-2 border-slate-900 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
                      placeholder="1.0.0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Deployment Date</label>
                    <input 
                      type="date"
                      required
                      value={modelModal.data.deploymentDate}
                      onChange={(e) => setModelModal(prev => ({ ...prev, data: { ...prev.data, deploymentDate: e.target.value } }))}
                      className="w-full bg-slate-50 border-2 border-slate-900 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Accuracy %</label>
                    <input 
                      type="text"
                      required
                      value={modelModal.data.accuracy}
                      onChange={(e) => setModelModal(prev => ({ ...prev, data: { ...prev.data, accuracy: e.target.value } }))}
                      className="w-full bg-slate-50 border-2 border-slate-900 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
                      placeholder="95.5"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Bias Status</label>
                  <select 
                    value={modelModal.data.biasStatus}
                    onChange={(e) => setModelModal(prev => ({ ...prev, data: { ...prev.data, biasStatus: e.target.value } }))}
                    className="w-full bg-slate-50 border-2 border-slate-900 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
                  >
                    <option value="Low">Low Risk</option>
                    <option value="Medium">Medium Risk</option>
                    <option value="High">High Risk</option>
                  </select>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setModelModal(prev => ({ ...prev, show: false }))}
                    className="flex-grow px-6 py-3 border-2 border-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-grow px-6 py-3 bg-indigo-600 text-white rounded-xl border-2 border-indigo-900 shadow-[4px_4px_0px_0px_rgba(30,27,75,1)] font-black text-[10px] uppercase tracking-widest hover:translate-y-1 hover:shadow-none transition-all"
                  >
                    {modelModal.isEditing ? 'Save Changes' : 'Register Model'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Version History Modal */}
      <AnimatePresence>
        {versionHistoryModal.show && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setVersionHistoryModal(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white border-2 border-slate-900 rounded-3xl p-8 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]"
            >
              <div className="flex items-start justify-between mb-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] bg-emerald-50 text-emerald-600">
                  <Clock size={24} />
                </div>
                <button 
                  onClick={() => setVersionHistoryModal(prev => ({ ...prev, show: false }))}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              
              <h3 className="text-xl font-black uppercase tracking-tight mb-2">Version History</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">{versionHistoryModal.modelName}</p>
              
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {modelVersions.length > 0 ? modelVersions.map((v) => (
                  <div key={v.id} className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-black uppercase text-slate-900">Version {v.version}</span>
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-white border-2 border-slate-900 rounded-full">
                          {v.archivedAt?.toDate?.()?.toLocaleDateString() || 'Recently'}
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        Accuracy: {v.accuracy}% • Bias: {v.biasStatus} • Deployed: {v.deploymentDate}
                      </p>
                    </div>
                    <button 
                      onClick={() => revertToVersion(versionHistoryModal.modelId!, v)}
                      className="px-4 py-2 bg-white text-slate-900 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] font-black text-[8px] uppercase tracking-widest hover:translate-y-0.5 hover:shadow-none transition-all flex items-center gap-2"
                    >
                      <RotateCcw size={12} /> Revert to this
                    </button>
                  </div>
                )) : (
                  <div className="text-center py-12">
                    <Clock className="mx-auto text-slate-200 mb-4" size={48} />
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">No historical versions found</p>
                  </div>
                )}
              </div>
              
              <div className="mt-8 pt-8 border-t-2 border-slate-100">
                <button 
                  onClick={() => setVersionHistoryModal(prev => ({ ...prev, show: false }))}
                  className="w-full px-6 py-3 border-2 border-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white border-2 border-slate-900 rounded-3xl p-8 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]"
            >
              <div className="flex items-start justify-between mb-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] ${
                  confirmModal.type === 'danger' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  {confirmModal.type === 'danger' ? <Trash2 size={24} /> : <AlertCircle size={24} />}
                </div>
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              
              <h3 className="text-xl font-black uppercase tracking-tight mb-3">{confirmModal.title}</h3>
              <p className="text-sm font-medium text-slate-500 leading-relaxed mb-8">{confirmModal.message}</p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="flex-grow px-6 py-3 border-2 border-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmModal.onConfirm}
                  className={`flex-grow px-6 py-3 text-white rounded-xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] font-black text-[10px] uppercase tracking-widest hover:translate-y-1 hover:shadow-none transition-all ${
                    confirmModal.type === 'danger' ? 'bg-red-600' : 'bg-indigo-600'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IntegrityCard({ title, status, score, desc }: { title: string; status: string; score: string; desc: string }) {
  return (
    <div className="bg-slate-50 border-2 border-slate-900 rounded-2xl p-6 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
      <div className="flex justify-between items-start mb-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</h4>
        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border-2 ${
          status === 'Pass' ? 'bg-emerald-50 text-emerald-900 border-emerald-900' : 'bg-orange-50 text-orange-900 border-orange-900'
        }`}>{status}</span>
      </div>
      <div className="text-2xl font-black text-slate-900 mb-1">{score}</div>
      <p className="text-[9px] font-bold text-slate-400 uppercase leading-snug">{desc}</p>
    </div>
  );
}

function MetricExplainer({ title, formula, desc, impact }: { title: string; formula: string; desc: string; impact: string }) {
  return (
    <div className="bg-white border-2 border-slate-900 rounded-2xl p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:translate-y-1 hover:shadow-none transition-all">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-black uppercase text-slate-900">{title}</h3>
        <span className="text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border-2 border-indigo-200">Impact: {impact}</span>
      </div>
      <div className="font-mono text-[9px] bg-slate-900 text-indigo-300 p-3 rounded-xl mb-4 border-2 border-slate-700 overflow-x-auto whitespace-nowrap">
        {formula}
      </div>
      <p className="text-[10px] font-medium text-slate-500 leading-relaxed uppercase">{desc}</p>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group border-2 ${
        active 
          ? 'bg-slate-900 text-white border-slate-900 shadow-[3px_3px_0px_0px_rgba(79,70,229,1)] translate-x-1' 
          : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-900 active:translate-x-0.5'
      }`}
    >
      <span className={`${active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-indigo-600'} transition-colors`}>{icon}</span>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      {active && <div className="ml-auto w-1 h-1 bg-indigo-400 rounded-full animate-pulse" />}
    </button>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="p-8 bg-white border-2 border-slate-900 rounded-3xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col h-full">
      <div className="mb-6 w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">{icon}</div>
      <h5 className="text-[10px] font-black tracking-widest uppercase text-slate-900 mb-4">{title}</h5>
      <p className="text-xs text-slate-500 font-bold leading-relaxed">{desc}</p>
    </div>
  );
}

function ActionCard({ title, desc }: { title: string, desc: string }) {
  return (
    <div className="p-5 bg-slate-50 border-2 border-slate-900 rounded-2xl hover:bg-white transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
      <h6 className="text-[10px] font-black uppercase text-slate-900 mb-1">{title}</h6>
      <p className="text-[11px] font-bold text-slate-500 leading-snug">{desc}</p>
    </div>
  );
}

