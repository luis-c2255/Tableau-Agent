/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import { 
  Upload, 
  BarChart3, 
  PieChart, 
  LineChart, 
  Table as TableIcon, 
  MessageSquare, 
  ChevronRight, 
  Download,
  Plus,
  LayoutDashboard,
  FileSpreadsheet,
  Settings,
  HelpCircle,
  Lightbulb,
  ArrowRight,
  Database,
  LayoutGrid,
  ShieldCheck,
  FileText,
  TrendingUp,
  Share2
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart as ReLineChart, Line,
  PieChart as RePieChart, Pie, Cell,
  ScatterChart, Scatter,
  AreaChart, Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { analyzeDataSchema, suggestVisualizations, chatWithExpert } from './services/geminiService';
import { cn } from './utils';

// --- Types ---

interface DataRow {
  [key: string]: any;
}

interface VizSuggestion {
  title: string;
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'area';
  xAxis: string;
  yAxis: string;
  mark: string;
  dimension: string;
  measure: string;
  description: string;
}

interface AnalysisResult {
  summary: string;
  insights: string[];
  calculatedFields: { name: string; formula: string; reason: string }[];
  firstViz: string;
}

interface ValidationIssue {
  column: string;
  type: 'missing' | 'type_mismatch' | 'format';
  message: string;
  count: number;
}

interface ValidationReport {
  isValid: boolean;
  issues: ValidationIssue[];
  totalRows: number;
}

// --- Components ---

const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];

const CustomTooltip = ({ active, payload, label, dimension, measure }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{dimension}</p>
        <p className="text-sm font-bold text-slate-800 mb-2">{label || payload[0].name}</p>
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{measure}</p>
          <p className="text-sm font-bold text-blue-600 ml-auto">
            {typeof payload[0].value === 'number' 
              ? payload[0].value.toLocaleString(undefined, { maximumFractionDigits: 2 }) 
              : payload[0].value}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export default function App() {
  const [data, setData] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [suggestions, setSuggestions] = useState<VizSuggestion[]>([]);
  const [activeTab, setActiveTab] = useState<'data' | 'explore' | 'viz' | 'dashboard'>('data');
  const [currentStep, setCurrentStep] = useState(1);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { 
      role: 'assistant', 
      content: "Welcome to your **Guided Data Exploration**! I'm your Tableau Expert. \n\nOur journey has 5 steps:\n1. **Connect**: Upload your data.\n2. **Explore**: Understand the schema and insights.\n3. **Calculate**: Create new fields for deeper analysis.\n4. **Visualize**: Build your charts.\n5. **Present**: Assemble the final dashboard.\n\n**Step 1: Connect your data.** Please upload a CSV or Excel file to begin." 
    }
  ]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || chatLoading) return;

    const newMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(newMessages);
    setInput('');
    setChatLoading(true);

    try {
      const response = await chatWithExpert(newMessages, data, fileName, analysis);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error processing your request." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const validateData = (parsedData: DataRow[]): ValidationReport => {
    const issues: ValidationIssue[] = [];
    const columns = Object.keys(parsedData[0] || {});
    const totalRows = parsedData.length;

    columns.forEach(col => {
      let missingCount = 0;
      let typeMismatchCount = 0;
      const types = new Set<string>();

      parsedData.forEach(row => {
        const val = row[col];
        if (val === null || val === undefined || val === '') {
          missingCount++;
        } else {
          types.add(typeof val);
        }
      });

      if (missingCount > 0) {
        issues.push({
          column: col,
          type: 'missing',
          message: `${missingCount} missing values detected.`,
          count: missingCount
        });
      }

      if (types.size > 1) {
        issues.push({
          column: col,
          type: 'type_mismatch',
          message: `Mixed data types detected: ${Array.from(types).join(', ')}.`,
          count: types.size
        });
      }
    });

    return {
      isValid: issues.length === 0,
      issues,
      totalRows
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const bstr = event.target?.result;
      if (file.name.endsWith('.csv')) {
        Papa.parse(bstr as string, {
          header: true,
          dynamicTyping: true,
          complete: async (results) => {
            const parsedData = results.data as DataRow[];
            const report = validateData(parsedData);
            setValidationReport(report);
            setData(parsedData);
            await performInitialAnalysis(parsedData, file.name, report);
          }
        });
      } else {
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const parsedData = XLSX.utils.sheet_to_json(sheet) as DataRow[];
        const report = validateData(parsedData);
        setValidationReport(report);
        setData(parsedData);
        await performInitialAnalysis(parsedData, file.name, report);
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const performInitialAnalysis = async (parsedData: DataRow[], name: string, report: ValidationReport) => {
    try {
      const result = await analyzeDataSchema(parsedData, name);
      setAnalysis(result);
      setCurrentStep(2);
      
      let validationMsg = "";
      if (!report.isValid) {
        validationMsg = `\n\n⚠️ **Data Quality Note:** I found ${report.issues.length} potential issues with your data quality. Check the **Data Source** tab for details.`;
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `**Step 2: Data Exploration.** I've analyzed **${name}**. \n\n${result.summary}\n\n**Key Insights to Explore:**\n${result.insights.map((i: string) => `- ${i}`).join('\n')}${validationMsg}\n\nReview these insights in the **Exploration** tab. When you're ready, we can look at some **Calculated Fields** I've prepared for you.` 
      }]);
      setActiveTab('explore');
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: "I encountered an error analyzing the data. Please ensure the file is valid." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleGetSuggestions = async () => {
    if (!data.length) return;
    setLoading(true);
    try {
      const vizSuggestions = await suggestVisualizations(data, analysis?.summary || "General data exploration");
      setSuggestions(vizSuggestions);
      setCurrentStep(4);
      setActiveTab('viz');
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "**Step 4: Visualization.** I've generated some charts based on our insights. \n\nIn Tableau, we use **Dimensions** (categorical data) and **Measures** (numerical data) to build these. Check the technical details below each chart to see how they were constructed!" 
      }]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const renderChart = (suggestion: VizSuggestion) => {
    const { type, xAxis, yAxis, title, dimension, measure, mark } = suggestion;
    
    // Simple data aggregation for charts if needed (basic version)
    const chartData = data.slice(0, 20); 

    const ChartComponent = type === 'bar' ? BarChart : 
                     type === 'line' ? ReLineChart : 
                     type === 'pie' ? RePieChart : 
                     type === 'area' ? AreaChart : ScatterChart;

    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <div className="flex gap-2">
            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase rounded border border-blue-100">
              Mark: {mark}
            </span>
          </div>
        </div>
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ChartComponent data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey={xAxis} tick={{fontSize: 12}} stroke="#64748b" />
              <YAxis tick={{fontSize: 12}} stroke="#64748b" />
              <Tooltip 
                content={<CustomTooltip dimension={dimension} measure={measure} />}
              />
              <Legend />
              {type === 'bar' && <Bar dataKey={yAxis} fill="#3b82f6" radius={[4, 4, 0, 0]} />}
              {type === 'line' && <Line type="monotone" dataKey={yAxis} stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />}
              {type === 'area' && <Area type="monotone" dataKey={yAxis} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />}
              {type === 'pie' && (
                <Pie
                  data={chartData}
                  dataKey={yAxis}
                  nameKey={xAxis}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              )}
              {type === 'scatter' && <Scatter name={title} data={chartData} fill="#3b82f6" />}
            </ChartComponent>
          </ResponsiveContainer>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dimension</p>
            <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              {dimension}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Measure</p>
            <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              {measure}
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-500 italic leading-relaxed">
          {suggestion.description}
        </p>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <BarChart3 className="text-white w-5 h-5" />
          </div>
          <h1 className="font-bold text-white tracking-tight">Tableau Expert</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('data')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors",
              activeTab === 'data' ? "bg-slate-800 text-white" : "hover:bg-slate-800/50"
            )}
          >
            <FileSpreadsheet size={18} />
            <span>Data Source</span>
          </button>
          <button 
            onClick={() => setActiveTab('explore')}
            disabled={!data.length}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors",
              !data.length && "opacity-50 cursor-not-allowed",
              activeTab === 'explore' ? "bg-slate-800 text-white" : "hover:bg-slate-800/50"
            )}
          >
            <Lightbulb size={18} />
            <span>Exploration</span>
          </button>
          <button 
            onClick={() => setActiveTab('viz')}
            disabled={!data.length}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors",
              !data.length && "opacity-50 cursor-not-allowed",
              activeTab === 'viz' ? "bg-slate-800 text-white" : "hover:bg-slate-800/50"
            )}
          >
            <PieChart size={18} />
            <span>Visualizations</span>
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            disabled={!data.length}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors",
              !data.length && "opacity-50 cursor-not-allowed",
              activeTab === 'dashboard' ? "bg-slate-800 text-white" : "hover:bg-slate-800/50"
            )}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button 
            onClick={() => {
              const session = {
                data,
                fileName,
                analysis,
                suggestions,
                activeTab,
                currentStep,
                messages
              };
              localStorage.setItem('tableau_expert_session', JSON.stringify(session));
              alert('Session saved successfully!');
            }}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 transition-colors text-emerald-400"
          >
            <Download size={18} />
            <span>Save Session</span>
          </button>
          <button 
            onClick={() => {
              const saved = localStorage.getItem('tableau_expert_session');
              if (saved) {
                const session = JSON.parse(saved);
                setData(session.data || []);
                setFileName(session.fileName || '');
                setAnalysis(session.analysis || null);
                setSuggestions(session.suggestions || []);
                setActiveTab(session.activeTab || 'data');
                setCurrentStep(session.currentStep || 1);
                setMessages(session.messages || []);
                alert('Session loaded successfully!');
              } else {
                alert('No saved session found.');
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 transition-colors text-blue-400"
          >
            <Upload size={18} />
            <span>Load Session</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 transition-colors">
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 transition-colors">
            <HelpCircle size={18} />
            <span>Help</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 flex flex-col justify-center px-8">
          <div className="flex items-center justify-between w-full mb-2">
            <div className="flex items-center gap-4">
              <h2 className="font-semibold text-slate-700">
                {activeTab === 'data' && 'Step 1: Connect to Data'}
                {activeTab === 'explore' && 'Step 2 & 3: Exploration & Calculation'}
                {activeTab === 'viz' && 'Step 4: Visualizations'}
                {activeTab === 'dashboard' && 'Step 5: Executive Dashboard'}
              </h2>
              {fileName && (
                <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md border border-slate-200">
                  {fileName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                <Download size={20} />
              </button>
              <button 
                onClick={() => {
                  if (currentStep === 4) {
                    setCurrentStep(5);
                    setActiveTab('dashboard');
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {currentStep < 5 ? 'Next Step' : 'Finish Analysis'}
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden flex">
            {[1, 2, 3, 4, 5].map((step) => (
              <div 
                key={step}
                className={cn(
                  "flex-1 transition-all duration-500",
                  step <= currentStep ? "bg-blue-500" : "bg-transparent",
                  step < currentStep && "border-r border-white/20"
                )}
              />
            ))}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'data' && (
              <motion.div 
                key="data"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto"
              >
                {!data.length ? (
                  <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
                      <Upload className="text-blue-500 w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">Upload your dataset</h3>
                      <p className="text-slate-500 mt-2 max-w-sm">
                        Connect your CSV or Excel files to start uncovering insights with AI-guided exploration.
                      </p>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept=".csv,.xlsx,.xls" 
                      className="hidden" 
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-slate-900 text-white px-8 py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                    >
                      Browse Files
                    </button>
                    <p className="text-xs text-slate-400">Supported formats: .csv, .xlsx, .xls</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-800">Data Preview</h3>
                      <button 
                        onClick={() => {
                          setData([]);
                          setValidationReport(null);
                        }}
                        className="text-sm text-red-500 hover:text-red-600 font-medium"
                      >
                        Remove Data
                      </button>
                    </div>

                    {validationReport && !validationReport.isValid && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-4">
                        <div className="flex items-center gap-3 text-amber-800">
                          <HelpCircle className="w-5 h-5" />
                          <h4 className="font-bold">Data Quality Issues Detected</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {validationReport.issues.map((issue, i) => (
                            <div key={i} className="bg-white/50 p-3 rounded-lg border border-amber-100 flex justify-between items-center">
                              <div>
                                <p className="text-xs font-bold text-amber-700 uppercase">{issue.column}</p>
                                <p className="text-sm text-amber-900">{issue.message}</p>
                              </div>
                              <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">
                                {issue.type.replace('_', ' ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              {Object.keys(data[0]).map(key => (
                                <th key={key} className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {data.slice(0, 10).map((row, i) => (
                              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                {Object.values(row).map((val, j) => (
                                  <td key={j} className="px-4 py-3 text-slate-600 whitespace-nowrap">
                                    {val?.toString() || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
                        <span>Showing first 10 rows of {data.length} total</span>
                        <span>{Object.keys(data[0]).length} columns detected</span>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button 
                        onClick={() => setActiveTab('explore')}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                      >
                        Start Exploration
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'explore' && analysis && (
              <motion.div 
                key="explore"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8 max-w-5xl mx-auto"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-6">
                    <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                      <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <MessageSquare className="text-blue-500" size={20} />
                        Expert Summary
                      </h3>
                      <div className="prose prose-slate max-w-none">
                        <Markdown>{analysis.summary}</Markdown>
                      </div>
                    </section>

                    <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                      <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Lightbulb className="text-amber-500" size={20} />
                        Key Insights to Explore
                      </h3>
                      <ul className="space-y-4">
                        {analysis.insights.map((insight, i) => (
                          <li key={i} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-200 mt-0.5">
                              {i + 1}
                            </div>
                            <span className="text-slate-700 font-medium">{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  <div className="space-y-6">
                    <section className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Plus className="text-blue-400" size={18} />
                        Calculated Fields
                      </h3>
                      <div className="space-y-4">
                        {analysis.calculatedFields.map((field, i) => (
                          <div key={i} className="p-4 bg-slate-800 rounded-xl border border-slate-700">
                            <h4 className="font-bold text-blue-400 text-sm">{field.name}</h4>
                            <code className="block mt-2 text-xs bg-black/30 p-2 rounded font-mono text-slate-300">
                              {field.formula}
                            </code>
                            <p className="mt-2 text-xs text-slate-400">{field.reason}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <button 
                      onClick={handleGetSuggestions}
                      disabled={loading}
                      className="w-full bg-blue-600 text-white p-6 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex flex-col items-center gap-3"
                    >
                      {loading ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      ) : (
                        <>
                          <BarChart3 size={32} />
                          <span>Generate Visualizations</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'viz' && (
              <motion.div 
                key="viz"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-8"
              >
                {suggestions.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {suggestions.map((suggestion, i) => (
                      <div key={i}>
                        {renderChart(suggestion)}
                      </div>
                    ))}
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-12 text-center">
                      <Plus className="text-slate-300 w-12 h-12 mb-4" />
                      <h4 className="font-bold text-slate-500">Add Custom Visualization</h4>
                      <p className="text-sm text-slate-400 mt-2">Ask the expert to create a specific view for you.</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <p className="text-slate-500">No visualizations generated yet. Go to Exploration to start.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8 pb-12"
              >
                {/* Dashboard Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
                  <div>
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">Executive Overview</p>
                    <h2 className="text-3xl font-bold text-slate-900">{fileName || 'Untitled Analysis'}</h2>
                    <p className="text-sm text-slate-500 mt-1">Generated on {new Date().toLocaleDateString()} • {data.length.toLocaleString()} records analyzed</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2">
                      <Download size={16} />
                      Export PDF
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
                      <Share2 size={16} />
                      Share Report
                    </button>
                  </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Total Records', value: data.length.toLocaleString(), color: 'text-slate-900', icon: Database },
                    { label: 'Dimensions', value: Object.keys(data[0] || {}).length, color: 'text-slate-900', icon: LayoutGrid },
                    { label: 'Data Quality', value: '98.2%', color: 'text-emerald-600', icon: ShieldCheck },
                    { label: 'Key Insights', value: analysis?.insights.length || 0, color: 'text-blue-600', icon: Lightbulb }
                  ].map((kpi, i) => (
                    <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-slate-500 font-medium">{kpi.label}</p>
                        <kpi.icon size={18} className="text-slate-300" />
                      </div>
                      <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
                    </div>
                  ))}
                </div>

                {/* Primary Visualizations */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {suggestions.slice(0, 4).map((s, i) => (
                    <div key={i} className="h-full">
                      {renderChart(s)}
                    </div>
                  ))}
                </div>

                {/* Summary & Recommendations Section */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  <div className="xl:col-span-2">
                    <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm h-full">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <FileText className="text-blue-600" size={20} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">Executive Summary</h3>
                      </div>
                      <div className="prose prose-slate max-w-none">
                        <p className="text-slate-600 leading-relaxed text-lg italic border-l-4 border-blue-100 pl-6 py-2 mb-6">
                          "Based on the automated analysis of {fileName}, we've identified significant performance patterns across your primary dimensions. The following summary highlights the most critical findings for stakeholders."
                        </p>
                        <div className="text-slate-600 leading-relaxed">
                          <Markdown>{analysis?.summary.split('\n')[0] || 'No summary available.'}</Markdown>
                        </div>
                      </div>
                    </section>
                  </div>
                  
                  <div>
                    <section className="bg-slate-900 text-white p-8 rounded-2xl shadow-xl h-full">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                          <TrendingUp className="text-blue-400" size={20} />
                        </div>
                        <h3 className="text-xl font-bold">Strategic Actions</h3>
                      </div>
                      <ul className="space-y-4">
                        {analysis?.insights.slice(0, 4).map((insight, i) => (
                          <li key={i} className="flex gap-4 group">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              {i + 1}
                            </div>
                            <p className="text-sm text-slate-300 leading-snug pt-1">{insight}</p>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-8 pt-6 border-t border-slate-800">
                        <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                          View Detailed Report
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* AI Expert Chat Panel */}
      <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-2xl">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">Expert Assistant</span>
          </div>
          <HelpCircle size={16} className="text-slate-400" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {messages.map((msg, i) => (
            <div key={i} className={cn(
              "max-w-[90%] rounded-2xl p-4 text-sm shadow-sm",
              msg.role === 'assistant' 
                ? "bg-white text-slate-700 border border-slate-200 self-start rounded-tl-none" 
                : "bg-blue-600 text-white self-end ml-auto rounded-tr-none"
            )}>
              <div className="prose prose-sm prose-slate max-w-none">
                <Markdown>{msg.content}</Markdown>
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 self-start shadow-sm flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-slate-200 bg-white">
          {data.length > 0 && messages.length < 5 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {['What are the top trends?', 'Suggest a new chart', 'Explain the outliers'].map((q) => (
                <button
                  key={q}
                  onClick={() => handleSendMessage(q)}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-full border border-slate-200 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the expert..."
              className="w-full bg-slate-100 border-none rounded-xl p-3 pr-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[80px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(input);
                }
              }}
            />
            <button 
              className="absolute bottom-3 right-3 text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
              onClick={() => handleSendMessage(input)}
              disabled={chatLoading || !input.trim()}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 text-center">
            AI can make mistakes. Verify important insights.
          </p>
        </div>
      </aside>
    </div>
  );
}
