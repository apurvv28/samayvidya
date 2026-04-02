'use client';

import { useCallback, useEffect, useState } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useToast } from '../../context/ToastContext';

const API_BASE_URL = 'http://localhost:8000';

const IGNORED_DB_KEYS = new Set(['load_distribution_id', 'uploaded_by', 'created_at', 'source_row']);

function getCanonicalRow(row, columns) {
  const canonical = {};
  columns.forEach((column) => {
    canonical[column] = row?.[column] ?? '';
  });
  return canonical;
}

export default function ManageFaculty() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadDistributionFile, setLoadDistributionFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clearingLoadData, setClearingLoadData] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showNewLoadWarning, setShowNewLoadWarning] = useState(false);
  const [dbColumns, setDbColumns] = useState([]);
  const [dbRows, setDbRows] = useState([]);
  const [previewColumns, setPreviewColumns] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [previewBackupRows, setPreviewBackupRows] = useState([]);
  const [uploadSummary, setUploadSummary] = useState(null);

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const fetchLoadDistributionFromDb = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      if (!token) {
        setDbColumns([]);
        setDbRows([]);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/faculty/load-distribution`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.detail || 'Failed to fetch load distribution from DB');
      }

      const rows = json.data || [];
      setDbRows(rows);
      if (rows.length > 0) {
        setDbColumns(Object.keys(rows[0]).filter((key) => !IGNORED_DB_KEYS.has(key)));
      } else {
        setDbColumns([]);
      }
    } catch (error) {
      console.error('Error fetching DB load distribution:', error);
      showToast('Failed to fetch current load data: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchLoadDistributionFromDb();
  }, [fetchLoadDistributionFromDb]);

  const handleFileChange = (e) => {
    if (dbRows.length > 0) {
      showToast('Existing DB load found. Use New Load to delete it first.', 'error');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setLoadDistributionFile(file);
    setUploadSummary(null);
  };

  const handlePreviewUpload = async () => {
    if (dbRows.length > 0) {
      showToast('Existing DB load found. Use New Load to delete it first.', 'error');
      return;
    }

    if (!loadDistributionFile) {
      showToast('Please select a CSV or XLSX file to upload.', 'error');
      return;
    }

    try {
      setUploading(true);
      const token = await getAuthToken();
      if (!token) {
        showToast('Authentication failed. Please log in again.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('file', loadDistributionFile);

      const response = await fetch(`${API_BASE_URL}/faculty/load-distribution/preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const json = await response.json();
      if (!response.ok) {
        const detail = typeof json.detail === 'string' ? json.detail : json.detail?.message || 'Failed to parse load distribution file';
        throw new Error(detail);
      }

      setPreviewColumns(json.data?.columns || []);
      setPreviewRows((json.data?.rows || []).map((row) => getCanonicalRow(row, json.data?.columns || [])));
      setIsEditingPreview(false);
      setPreviewBackupRows([]);
      setUploadSummary({ total_rows: json.data?.total_rows || 0 });
      setShowUploadModal(false);
      showToast(json.message || 'File parsed successfully.', 'success');
    } catch (error) {
      console.error('Error parsing load distribution file:', error);
      showToast('Failed to parse file: ' + error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleStartPreviewEdit = () => {
    setPreviewBackupRows(previewRows.map((row) => ({ ...row })));
    setIsEditingPreview(true);
  };

  const handleCancelPreviewEdit = () => {
    setPreviewRows(previewBackupRows.map((row) => ({ ...row })));
    setIsEditingPreview(false);
    setPreviewBackupRows([]);
  };

  const handleSavePreviewEdit = () => {
    setIsEditingPreview(false);
    setPreviewBackupRows([]);
    showToast('Preview changes saved.', 'success');
  };

  const handlePreviewCellChange = (rowIndex, column, value) => {
    setPreviewRows((prevRows) => {
      const nextRows = [...prevRows];
      nextRows[rowIndex] = {
        ...nextRows[rowIndex],
        [column]: value,
      };
      return nextRows;
    });
  };

  const handleSubmitLoadDistribution = async () => {
    if (!previewColumns.length || !previewRows.length) {
      showToast('Please upload and preview a file first.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const token = await getAuthToken();
      if (!token) {
        showToast('Authentication failed. Please log in again.', 'error');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/faculty/load-distribution/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          columns: previewColumns,
          rows: previewRows,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        const detail = json.detail;
        if (typeof detail === 'object' && detail?.errors?.length) {
          throw new Error(detail.errors.slice(0, 3).join(' | '));
        }
        throw new Error(typeof detail === 'string' ? detail : 'Failed to submit load distribution');
      }

      showToast(json.message || 'Load distribution inserted successfully.', 'success');
      setUploadSummary({
        total_rows: json.data?.total_rows || previewRows.length,
        created: json.data?.inserted || 0,
        failed: 0,
      });
      setPreviewColumns([]);
      setPreviewRows([]);
      setLoadDistributionFile(null);
      setIsEditingPreview(false);
      setPreviewBackupRows([]);
      await fetchLoadDistributionFromDb();
    } catch (error) {
      console.error('Error submitting load distribution:', error);
      showToast('Failed to submit: ' + error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmNewLoad = async () => {
    try {
      setClearingLoadData(true);
      const token = await getAuthToken();
      if (!token) {
        showToast('Authentication failed. Please log in again.', 'error');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/faculty/load-distribution`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.detail || 'Failed to clear previous load data');
      }

      setDbRows([]);
      setDbColumns([]);
      setPreviewColumns([]);
      setPreviewRows([]);
      setUploadSummary(null);
      setLoadDistributionFile(null);
      setShowNewLoadWarning(false);
      setShowUploadModal(true);
      showToast(json.message || 'Previous load data deleted. You can upload new data now.', 'success');
    } catch (error) {
      console.error('Error clearing previous load data:', error);
      showToast('Failed to clear previous data: ' + error.message, 'error');
    } finally {
      setClearingLoadData(false);
    }
  };

  const renderTable = (rows, columns, editable) => (
    <div className="max-h-[65vh] overflow-auto rounded-lg border border-gray-800">
      <table className="min-w-full text-sm text-gray-200">
        <thead className="bg-gray-900/90 sticky top-0 z-10">
          <tr>
            {columns.map((column) => (
              <th key={column} className="text-left px-4 py-3 border-b border-gray-800 whitespace-nowrap font-medium text-gray-300">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${editable ? 'preview' : 'db'}-row-${rowIndex}`} className="border-b border-gray-900/70 last:border-b-0 hover:bg-gray-900/40">
              {columns.map((column) => (
                <td key={`${rowIndex}-${column}`} className="px-4 py-2.5 whitespace-nowrap align-top">
                  {editable && isEditingPreview ? (
                    <input
                      type="text"
                      value={row[column] || ''}
                      onChange={(e) => handlePreviewCellChange(rowIndex, column, e.target.value)}
                      className="w-full min-w-35 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-gray-100"
                    />
                  ) : (
                    row[column] ?? '-'
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Manage Load Distribution</h2>
          <p className="text-gray-400">Preview, edit, submit, and replace load distribution uploads.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => {
              if (dbRows.length > 0) {
                setShowNewLoadWarning(true);
                return;
              }
              setShowUploadModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium transition-colors"
          >
            <Upload className="w-5 h-5" />
            {dbRows.length > 0 ? 'New Load' : 'Upload Data'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h3 className="text-xl font-semibold text-white">
              {dbRows.length > 0 ? 'Saved DB Preview' : 'Load Distribution Preview'}
            </h3>
            {uploadSummary && (
              <p className="text-sm text-emerald-300">
                Rows: {uploadSummary.total_rows || 0}
                {typeof uploadSummary.created === 'number' ? ` | Inserted: ${uploadSummary.created}` : ''}
              </p>
            )}
          </div>

          {dbRows.length > 0 ? (
            <>
              {renderTable(dbRows, dbColumns, false)}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewLoadWarning(true)}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
                >
                  New Load
                </button>
              </div>
            </>
          ) : previewRows.length > 0 ? (
            <>
              {renderTable(previewRows, previewColumns, true)}
              <div className="flex justify-end gap-3 flex-wrap">
                {!isEditingPreview ? (
                  <button
                    type="button"
                    onClick={handleStartPreviewEdit}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
                  >
                    Edit Preview
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelPreviewEdit}
                      className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                    >
                      Cancel Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePreviewEdit}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
                    >
                      Save Preview
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleSubmitLoadDistribution}
                  disabled={submitting || isEditingPreview}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Submitting...' : 'Submit To Database'}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-gray-500 bg-gray-950/30 rounded-lg border border-dashed border-gray-800">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Upload a CSV/XLSX file to preview load distribution data.</p>
            </div>
          )}
        </div>
      )}

      {showNewLoadWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-xl font-bold text-white">Start New Load?</h3>
              <p className="text-sm text-gray-400 mt-2">
                Previous load distribution data will be permanently deleted from DB. If you cancel, you cannot add new data.
              </p>
            </div>
            <div className="p-6 flex justify-end gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setShowNewLoadWarning(false)}
                disabled={clearingLoadData}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNewLoad}
                disabled={clearingLoadData}
                className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {clearingLoadData && <Loader2 className="w-4 h-4 animate-spin" />}
                {clearingLoadData ? 'Deleting...' : 'Delete Previous & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-gray-800/50">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                Upload Load Distribution
              </h3>
              <button
                onClick={() => {
                  if (uploading) return;
                  setShowUploadModal(false);
                  setLoadDistributionFile(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Load File (CSV/XLSX)</label>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileChange}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white file:mr-4 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-500"
                />
                {loadDistributionFile && (
                  <p className="text-sm text-emerald-300 mt-2">
                    Selected file: {loadDistributionFile.name}
                  </p>
                )}
              </div>

              <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 space-y-2">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                  <p>
                    Required columns: <span className="text-white">Faculty Name, Year, Division, Subject, Theory Hrs, Lab Hrs, Tutorial Hrs</span>.
                  </p>
                </div>
                <p className="text-gray-400">
                  Optional columns: <span className="text-white">Batch, Total Hrs/Week</span>. The uploaded file is parsed first and shown as a dynamic table before submission.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    if (uploading) return;
                    setShowUploadModal(false);
                    setLoadDistributionFile(null);
                  }}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={uploading || !loadDistributionFile}
                  onClick={handlePreviewUpload}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {uploading ? 'Parsing...' : 'Upload & Preview'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
