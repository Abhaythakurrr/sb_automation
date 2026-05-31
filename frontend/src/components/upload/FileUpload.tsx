'use client';

import { useState, useRef } from 'react';
import { useJobStore } from '@/store/useJobStore';
import { ApiClient } from '@/services/api';

export default function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiClient = new ApiClient();

  const { setParsedData, setParsingError, setUploadedFile } = useJobStore();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files: FileList) => {
    if (files.length === 0) return;

    const file = files[0];
    const validTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
    ];

    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Please upload CSV, XLSX, or ODS file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const response = await apiClient.uploadFile(file);
      setUploadedFile(file);
      setParsedData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload file');
      setParsingError(err.response?.data?.error || 'Failed to parse file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300
          ${isDragging
            ? 'border-cyan-500 bg-cyan-500/10 scale-105'
            : 'border-slate-700 hover:border-cyan-500/50 hover:bg-slate-900/50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".csv,.xlsx,.ods"
          onChange={handleFileSelect}
        />
        <div className="space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-cyan-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium text-slate-200">
              Drag and drop the file here
            </p>
            <p className="text-sm text-slate-400 mt-2">
              or click to browse (CSV, XLSX, ODS)
            </p>
          </div>
          <div className="flex justify-center gap-4 text-xs text-slate-500">
            <span>Max size: 10MB</span>
            <span>•</span>
            <span>Supported: .csv, .xlsx, .ods</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2 text-red-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {uploading && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-cyan-400">Uploading and parsing file...</span>
            <span className="text-xs text-slate-400">Please wait</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 animate-pulse w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
