import { create } from 'zustand';
import { JobRow } from '@/types';

interface ExecutionResult {
  id: string;
  type: 'task' | 'trigger';
  name: string;
  status: 'pending' | 'success' | 'failed';
  message?: string;
  sbId?: string;
  createdAt: string;
  completedAt?: string;
}

interface JobState {
  // File upload state
  uploadedFile: File | null;
  parsedData: { rows: JobRow[] } | null;
  parsingError: string | null;

  // Preview state
  selectedRowIndex: number | null;
  taskPreview: any | null;
  triggerPreview: any | null;

  // Reference job comparison
  refJobData: any | null;
  comparisonData: any[] | null;

  // Execution state
  executionResults: ExecutionResult[];
  isExecuting: boolean;
  executionProgress: number;
  executionLogs: string[];

  // Actions
  setUploadedFile: (file: File | null) => void;
  setParsedData: (data: { rows: JobRow[] } | null) => void;
  setParsingError: (error: string | null) => void;
  setSelectedRowIndex: (index: number | null) => void;
  setTaskPreview: (task: any | null) => void;
  setTriggerPreview: (trigger: any | null) => void;
  setRefJobData: (data: any | null) => void;
  setComparisonData: (data: any[] | null) => void;
  addExecutionResult: (result: ExecutionResult) => void;
  setExecutionResults: (results: ExecutionResult[]) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  setExecutionProgress: (progress: number) => void;
  addExecutionLog: (log: string) => void;
  clearExecutionLogs: () => void;
  reset: () => void;
}

export const useJobStore = create<JobState>((set) => ({
  // State
  uploadedFile: null,
  parsedData: null,
  parsingError: null,
  selectedRowIndex: null,
  taskPreview: null,
  triggerPreview: null,
  refJobData: null,
  comparisonData: null,
  executionResults: [],
  isExecuting: false,
  executionProgress: 0,
  executionLogs: [],

  // Actions
  setUploadedFile: (file) => set({ uploadedFile: file }),
  setParsedData: (data) => set({ parsedData: data, parsingError: null }),
  setParsingError: (error) => set({ parsingError: error }),
  setSelectedRowIndex: (index) => set({ selectedRowIndex: index }),
  setTaskPreview: (task) => set({ taskPreview: task }),
  setTriggerPreview: (trigger) => set({ triggerPreview: trigger }),
  setRefJobData: (data) => set({ refJobData: data }),
  setComparisonData: (data) => set({ comparisonData: data }),
  addExecutionResult: (result) => set((state) => ({
    executionResults: [...state.executionResults, result],
  })),
  setExecutionResults: (results) => set({ executionResults: results }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setExecutionProgress: (progress) => set({ executionProgress: progress }),
  addExecutionLog: (log) => set((state) => ({
    executionLogs: [...state.executionLogs, `[${new Date().toLocaleTimeString()}] ${log}`],
  })),
  clearExecutionLogs: () => set({ executionLogs: [] }),
  reset: () => set({
    uploadedFile: null,
    parsedData: null,
    parsingError: null,
    selectedRowIndex: null,
    taskPreview: null,
    triggerPreview: null,
    refJobData: null,
    comparisonData: null,
    executionResults: [],
    isExecuting: false,
    executionProgress: 0,
    executionLogs: [],
  }),
}));
