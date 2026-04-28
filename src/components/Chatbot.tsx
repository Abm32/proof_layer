import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Bot, User, Sparkles, LayoutDashboard, History, Scale, Database, Settings, FileText, Play } from 'lucide-react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { systemInstruction, tools, initGemini } from '../services/geminiService';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface ChatbotProps {
  onNavigate: (view: any) => void;
  onSearch: (query: string) => void;
  onRunAnalysis: () => void;
  onRegisterModel: (data: any) => void;
  currentView: string;
}

export const Chatbot: React.FC<ChatbotProps> = ({ onNavigate, onSearch, onRunAnalysis, onRegisterModel, currentView }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I am ProofLayer AI. How can I help you audit your data today?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsTyping(true);

    try {
      const genAI = initGemini();
      const chat = genAI.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction,
          tools,
        },
        history: messages.map(m => ({
          role: m.role as any,
          parts: [{ text: m.text }]
        }))
      });

      const result = await chat.sendMessage({
        message: userMessage
      });

      const response = result;
      
      // Handle function calls
      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          const args = call.args as any;
          if (call.name === 'navigateTo') {
            onNavigate(args.view);
            const confirmation = `I've navigated you to the ${args.view} page.`;
            setMessages(prev => [...prev, { role: 'model', text: confirmation }]);
          } else if (call.name === 'searchAuditLogs') {
            onSearch(args.query);
            onNavigate('history');
            const confirmation = `I've searched for "${args.query}" in your audit logs.`;
            setMessages(prev => [...prev, { role: 'model', text: confirmation }]);
          } else if (call.name === 'runAnalysis') {
            onRunAnalysis();
            const confirmation = `I've triggered the audit analysis for you. Check the results in a moment!`;
            setMessages(prev => [...prev, { role: 'model', text: confirmation }]);
          } else if (call.name === 'registerModel') {
            onRegisterModel(args);
            const confirmation = `I've registered the model "${args.name}" v${args.version} for you.`;
            setMessages(prev => [...prev, { role: 'model', text: confirmation }]);
          }
        }
      }
 else if (response.text) {
        setMessages(prev => [...prev, { role: 'model', text: response.text! }]);
      }
    } catch (error) {
      console.error("Chatbot Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "I'm having trouble connecting to my brain right now. Please try again later!" }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 w-12 h-12 sm:w-16 sm:h-16 bg-indigo-600 text-white rounded-xl sm:rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex items-center justify-center z-50 cursor-pointer"
      >
        <MessageSquare className="w-6 h-6 sm:w-8 sm:h-8" />
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.8 }}
            className="fixed bottom-20 right-4 sm:bottom-28 sm:right-8 w-[calc(100%-2rem)] sm:w-[400px] h-[70vh] sm:h-[600px] bg-white border-4 border-slate-900 rounded-3xl shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] flex flex-col z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 bg-indigo-600 border-b-4 border-slate-900 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                  <Bot className="text-indigo-600" size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight">ProofLayer Assistant</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-indigo-500 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 custom-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-3 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`p-2 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] h-fit ${m.role === 'user' ? 'bg-amber-100' : 'bg-white'}`}>
                      {m.role === 'user' ? <User size={16} /> : <Bot size={16} className="text-indigo-600" />}
                    </div>
                    <div className={`p-4 rounded-2xl border-2 border-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] text-xs font-bold leading-relaxed ${
                      m.role === 'user' ? 'bg-amber-50' : 'bg-white'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="flex gap-3">
                    <div className="p-2 bg-white rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] h-fit">
                      <Bot size={16} className="text-indigo-600" />
                    </div>
                    <div className="bg-white p-4 rounded-2xl border-2 border-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                      <div className="flex gap-1">
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Actions */}
            <div className="p-4 bg-white border-t-2 border-slate-100 flex gap-2 overflow-x-auto no-scrollbar">
              <QuickAction icon={<LayoutDashboard size={12} />} label="Audit" onClick={() => onNavigate('audit')} />
              <QuickAction icon={<History size={12} />} label="History" onClick={() => onNavigate('history')} />
              <QuickAction icon={<Sparkles size={12} />} label="Models" onClick={() => onNavigate('models')} />
              <QuickAction icon={<Scale size={12} />} label="Metrics" onClick={() => onNavigate('metrics')} />
              <QuickAction icon={<Play size={12} />} label="Run" onClick={onRunAnalysis} />
            </div>

            {/* Input */}
            <div className="p-6 bg-white border-t-4 border-slate-900">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="relative"
              >
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me anything..."
                  className="w-full bg-slate-50 border-2 border-slate-900 rounded-2xl pl-4 pr-14 py-4 text-xs font-black uppercase tracking-tight focus:ring-0 focus:border-indigo-600 transition-all shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] placeholder:text-slate-300"
                />
                <button 
                  type="submit"
                  disabled={isTyping}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600 text-white rounded-xl border-2 border-indigo-900 shadow-[2px_2px_0px_0px_rgba(30,27,75,1)] hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border-2 border-slate-900 rounded-lg shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:translate-y-0.5 hover:shadow-none transition-all whitespace-nowrap"
    >
      <span className="text-indigo-600">{icon}</span>
      <span className="text-[10px] font-black uppercase tracking-tighter text-slate-600">{label}</span>
    </button>
  );
}
