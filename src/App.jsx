import { useMemo, useState, useEffect } from 'react'
import './App.css'

function App() {
  const [form, setForm] = useState({ username: '', password: '', tin: '', address: '', unit: '' })
  const [busy, setBusy] = useState(false)
  const [singleResult, setSingleResult] = useState(null)

  const [file, setFile] = useState(null)
  const [jobId, setJobId] = useState('')
  const [batchResults, setBatchResults] = useState([])
  const [error, setError] = useState(null)

  // Safe setter for batch results to prevent objects from being set
  const setBatchResultsSafe = (newResults) => {
    console.log('Setting batch results:', newResults)
    if (Array.isArray(newResults)) {
      setBatchResults(newResults)
    } else {
      console.error('Attempted to set non-array batch results:', newResults)
      setBatchResults([])
    }
  }

  // Safe setter for jobId to prevent objects from being set
  const setJobIdSafe = (newJobId) => {
    console.log('Setting jobId:', newJobId)
    if (typeof newJobId === 'string' || typeof newJobId === 'number') {
      setJobId(String(newJobId))
    } else {
      console.error('Attempted to set non-string jobId:', newJobId)
      setJobId('')
    }
  }

  // Clear any errors when starting new operations
  const clearError = () => setError(null)

  // Load saved credentials on component mount
  useEffect(() => {
    const savedUsername = localStorage.getItem('fpl_username')
    const savedTin = localStorage.getItem('fpl_tin')
    if (savedUsername || savedTin) {
      setForm(prev => ({
        ...prev,
        username: savedUsername || '',
        tin: savedTin || ''
      }))
    }
  }, [])

  // Save credentials to localStorage
  const saveCredentials = (username, tin) => {
    if (username) localStorage.setItem('fpl_username', username)
    if (tin) localStorage.setItem('fpl_tin', tin)
  }

  // Clear saved credentials
  const clearCredentials = () => {
    localStorage.removeItem('fpl_username')
    localStorage.removeItem('fpl_tin')
    setForm(prev => ({
      ...prev,
      username: '',
      tin: ''
    }))
  }

  const canSubmitSingle = useMemo(() => form.username && form.password && form.tin && form.address, [form])
  const canSubmitBatch = useMemo(() => form.username && form.password && form.tin && file, [form, file])

  async function submitSingle(e) {
    e.preventDefault()
    setBusy(true)
    setSingleResult(null)
    try {
      // Save credentials for future use
      saveCredentials(form.username, form.tin)
      
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          tin: form.tin,
          address: form.address,
          unit: form.unit || undefined,
        }),
      })
      const data = await res.json()
      setSingleResult(data)
    } catch (err) {
      setSingleResult({ error: err?.message || 'Request failed' })
    } finally {
      setBusy(false)
    }
  }

  async function submitBatch(e) {
    console.log('submitBatch called')
    e.preventDefault()
    
    try {
      console.log('Setting busy state')
      setBusy(true)
      setBatchResultsSafe([])
      setJobIdSafe('')
      
      console.log('Form data:', { username: form.username, tin: form.tin, file: file?.name })
      
      // Save credentials for future use
      console.log('Saving credentials')
      saveCredentials(form.username, form.tin)
      
      console.log('Creating FormData')
      const fd = new FormData()
      fd.append('username', form.username)
      fd.append('password', form.password)
      fd.append('tin', form.tin)
      fd.append('file', file)
      
      console.log('Making API request to:', `${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/batch`)
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/batch`, { method: 'POST', body: fd })
      
      console.log('Response status:', res.status)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      
      console.log('Parsing response JSON')
      const data = await res.json()
      console.log('Batch response:', data) // Debug log
      
      // Handle both direct jobId string and job object responses
      let jobIdToUse = null
      if (typeof data === 'string') {
        jobIdToUse = data
      } else if (data && typeof data === 'object' && data.jobId) {
        // Check if jobId is a string or nested object
        if (typeof data.jobId === 'string') {
          jobIdToUse = data.jobId
        } else if (typeof data.jobId === 'object' && data.jobId.jobId) {
          jobIdToUse = data.jobId.jobId
        }
      } else if (data && typeof data === 'object' && data.job_id) {
        jobIdToUse = data.job_id
      }
      
      if (jobIdToUse) {
        console.log('Job ID received:', jobIdToUse)
        setJobIdSafe(jobIdToUse)
        // poll results every 2s until completed
        console.log('Starting polling')
        pollResults(jobIdToUse)
      } else {
        console.error('No jobId found in response:', data)
        setError(`No jobId found in response: ${JSON.stringify(data)}`)
        setBusy(false)
      }
    } catch (err) {
      console.error('Batch submission error:', err)
      setError(`Batch submission failed: ${err.message}`)
      setBusy(false)
    }
  }

  async function pollResults(job) {
    let done = false
    let pollCount = 0
    const maxPolls = 300 // Stop after 10 minutes (300 * 2s) for long lists
    
    console.log('Starting to poll for job:', job)
    
    while (!done && pollCount < maxPolls) {
      await new Promise(r => setTimeout(r, 2000))
      pollCount++
      
      try {
        console.log(`Polling attempt ${pollCount}/${maxPolls} for job:`, job)
        
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/jobs/${job}/results`)
        if (!res.ok) {
          console.error('Failed to fetch results:', res.status, res.statusText)
          break
        }
        
        const data = await res.json()
        console.log('Polling results:', data) // Debug log
        
        // Safely update results - handle both array and object responses
        if (Array.isArray(data)) {
          console.log('Setting batchResults to array:', data)
          setBatchResultsSafe(data)
        } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
          console.log('Setting batchResults to data.results:', data.results)
          setBatchResultsSafe(data.results)
        } else {
          console.warn('Unexpected data format:', data)
          setBatchResultsSafe([])
        }
        
        // Check if job is complete by looking at job status
        try {
          const jobRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/jobs`)
          if (jobRes.ok) {
            const jobs = await jobRes.json()
            console.log('All jobs:', jobs) // Debug log
            const currentJob = jobs.find(j => j.job_id === job)
            if (currentJob) {
              console.log('Found job:', currentJob) // Debug log
              console.log('Job status:', currentJob.status) // Debug log
              done = currentJob.status !== 'running'
            } else {
              console.log('Job not found in jobs list, continuing to poll...')
              // Don't assume complete, continue polling
              done = false
            }
          }
        } catch (jobError) {
          console.warn('Failed to check job status:', jobError)
          // Continue polling even if job status check fails
        }
        
        // Also stop if we have results and no errors
        const resultsArray = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : [])
        if (resultsArray.length > 0) {
          const hasErrors = resultsArray.some(r => r && r.error)
          if (!hasErrors) {
            console.log('No errors found, assuming job complete')
            done = true
          }
        }
        
        // If we've been polling for a while and still no results, check if we should continue
        if (pollCount > 10 && resultsArray.length === 0) {
          console.log('Been polling for a while with no results, continuing...')
        }
        
        // Show progress every 10 polls
        if (pollCount % 10 === 0) {
          console.log(`Polling progress: ${pollCount}/${maxPolls} attempts, ${resultsArray.length} results so far`)
        }
        
      } catch (error) {
        console.error('Polling error:', error)
        // Don't break on error, continue polling
        console.log('Continuing to poll despite error...')
      }
    }
    
    if (pollCount >= maxPolls) {
      console.log('Polling timeout reached')
    }
    
    console.log('Polling completed for job:', job)
    setBusy(false)
  }

  function downloadCsv() {
    const header = 'address,unit,meter_status,property_status,status_captured_at,error\n'
    const rows = (batchResults || []).map(r => [
      r.address || '', 
      r.unit || '', 
      r.meter_status || '', 
      r.property_status || '', 
      r.status_captured_at ? new Date(r.status_captured_at).toLocaleString() : '',
      r.error || ''
    ].map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `results-${jobId || 'batch'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Error boundary for rendering
  if (error) {
    return (
      <div className="container">
        <h1>FPL Power/Meter Status</h1>
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '20px', borderRadius: '4px', margin: '20px 0' }}>
          <h3>Application Error</h3>
          <p>{error}</p>
          <button onClick={() => { setError(null); window.location.reload(); }} style={{ marginTop: '10px', padding: '8px 16px' }}>
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  try {
    return (
      <div className="container">
        <h1>FPL Power/Meter Status</h1>

      <section>
        <h2>Credentials</h2>
        <div className="grid">
          <input 
            placeholder="Username" 
            value={form.username} 
            onChange={(e)=>setForm({...form, username:e.target.value})}
            autoComplete="username"
            name="username"
          />
          <input 
            placeholder="Password" 
            type="password" 
            value={form.password} 
            onChange={(e)=>setForm({...form, password:e.target.value})}
            autoComplete="current-password"
            name="password"
          />
          <input 
            placeholder="TIN" 
            value={form.tin} 
            onChange={(e)=>setForm({...form, tin:e.target.value})}
            autoComplete="off"
            name="tin"
          />
        </div>
        <div style={{ marginTop: '10px' }}>
          <button 
            type="button" 
            onClick={clearCredentials}
            style={{ 
              background: '#dc3545', 
              color: 'white', 
              border: 'none', 
              padding: '8px 16px', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear Saved Credentials
          </button>
        </div>
      </section>

      <section>
        <h2>Single Address Lookup</h2>
        <form onSubmit={submitSingle}>
          <div className="grid">
            <input placeholder="Address" value={form.address} onChange={(e)=>setForm({...form, address:e.target.value})} />
            <input placeholder="Apt/Unit # (optional)" value={form.unit} onChange={(e)=>setForm({...form, unit:e.target.value})} />
          </div>
          <button type="submit" disabled={!canSubmitSingle || busy}>Check Status</button>
        </form>
        {singleResult && (
          <div className="result">
            {singleResult.error ? (
              <div className="error">{singleResult.error}</div>
            ) : (
              <ul>
                <li><strong>Address:</strong> {singleResult.address} {singleResult.unit ? `#${singleResult.unit}` : ''}</li>
                <li><strong>Meter Status:</strong> {singleResult.meterStatus}</li>
                <li><strong>Property Status:</strong> {singleResult.propertyStatus}</li>
              </ul>
            )}
          </div>
        )}
      </section>

      <section>
        <h2>Batch (CSV Upload)</h2>
        <form onSubmit={submitBatch}>
          <input type="file" accept=".csv" onChange={(e)=>setFile(e.target.files?.[0] || null)} />
          <button type="submit" disabled={!canSubmitBatch || busy}>Start Batch</button>
        </form>

        {jobId && (
          <div className="table-wrapper">
            <div className="toolbar">
              <span>Job: {String(jobId)}</span>
              <button onClick={downloadCsv}>Download CSV</button>
            </div>
            {busy && (
              <div style={{ padding: '20px', textAlign: 'center', background: '#f8f9fa', borderRadius: '4px', margin: '10px 0' }}>
                <div>Processing batch job... Please wait.</div>
                <div style={{ fontSize: '0.9em', color: '#666', marginTop: '5px' }}>
                  Results: {batchResults.length} processed so far
                </div>
                <div style={{ fontSize: '0.8em', color: '#888', marginTop: '3px' }}>
                  Check browser console (F12) for detailed progress updates.
                </div>
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Address</th>
                  <th>Unit</th>
                  <th>Meter Status</th>
                  <th>Property Status</th>
                  <th>Status Captured</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  console.log('Rendering batchResults:', batchResults)
                  return (batchResults || []).map((r, idx) => {
                  try {
                    // Ensure r is an object and not something else
                    if (!r || typeof r !== 'object') {
                      console.warn('Invalid row data:', r)
                      return (
                        <tr key={idx}>
                          <td data-label="#">{idx+1}</td>
                          <td data-label="Address" colSpan="6" className="error">Invalid data</td>
                        </tr>
                      )
                    }
                    
                    return (
                      <tr key={idx}>
                        <td data-label="#">{idx+1}</td>
                        <td data-label="Address">{String(r?.address || '-')}</td>
                        <td data-label="Unit">{String(r?.unit || '-')}</td>
                        <td data-label="Meter Status">{String(r?.meter_status || '-')}</td>
                        <td data-label="Property Status">{String(r?.property_status || '-')}</td>
                        <td data-label="Status Captured">{r?.status_captured_at ? new Date(r.status_captured_at).toLocaleString() : '-'}</td>
                        <td data-label="Error" className="error">{String(r?.error || '-')}</td>
                      </tr>
                    )
                  } catch (error) {
                    console.error('Error rendering row:', error, r)
                    return (
                      <tr key={idx}>
                        <td data-label="#">{idx+1}</td>
                        <td data-label="Address" colSpan="6" className="error">Error rendering row</td>
                      </tr>
                    )
                  }
                })
                })()}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
    )
  } catch (renderError) {
    console.error('Rendering error:', renderError)
    return (
      <div className="container">
        <h1>FPL Power/Meter Status</h1>
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '20px', borderRadius: '4px', margin: '20px 0' }}>
          <h3>Rendering Error</h3>
          <p>An error occurred while rendering the page: {renderError.message}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: '10px', padding: '8px 16px' }}>
            Reload Page
          </button>
        </div>
      </div>
    )
  }
}

export default App
