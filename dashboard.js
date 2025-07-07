let chart;

async function loadData(minutes = 1440) {
      try {
        log(`📡 Fetching app usage for last ${minutes} minutes...`);
        hideError();
        showLoading();

        // Check if electronAPI is available
        if (!window.electronAPI) {
          throw new Error("Electron API not available. Make sure preload.js is loaded.");
        }

        const token = await window.electronAPI.getToken();
        log(`🔑 Token received: ${token ? 'Yes' : 'No'}`);
        
        if (!token) {
          throw new Error("You must be logged in to view your dashboard.");
        }

        const url = `https://focusbee-cloud.onrender.com/focus/me/app-usage?since_minutes=${minutes}`;
        log(`📡 Fetching: ${url}`);

        const response = await fetch(url, {
          headers: {
            "Authorization": "Bearer " + token
          }
        });

        log(`📨 Response status: ${response.status}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        log(`📊 Data received: ${JSON.stringify(data)}`);

        if (!data || Object.keys(data).length === 0) {
          throw new Error("No app usage data available for the selected time period.");
        }

        const labels = Object.keys(data);
        const values = Object.values(data);

        // Destroy existing chart
        if (chart) {
          chart.destroy();
        }

        // Create new chart
        const ctx = document.getElementById('usageChart').getContext('2d');
        chart = new Chart(ctx, {
          type: 'pie',
          data: {
            labels,
            datasets: [{
              data: values,
              backgroundColor: labels.map((_, i) => {
                const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
                return colors[i % colors.length];
              }),
              borderWidth: 2,
              borderColor: '#fff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right'
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const label = context.label || '';
                    const value = context.parsed;
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    const percentage = ((value / total) * 100).toFixed(1);
                    return `${label}: ${value} min (${percentage}%)`;
                  }
                }
              }
            }
          }
        });

        // Store for CSV export
        window._latestUsageData = data;
        log(`✅ Chart created successfully`);
        
      } catch (error) {
        log(`❌ Error: ${error.message}`);
        showError(error.message);
      } finally {
        hideLoading();
      }
    }

    function downloadData() {
      try {
        const data = window._latestUsageData || {};
        
        if (Object.keys(data).length === 0) {
          alert("No data to export. Please load some data first.");
          return;
        }
        
        let csv = "App,Minutes\n";
        for (const app in data) {
          csv += `"${app}",${data[app]}\n`;
        }

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `focusbae_app_usage_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        
        // Clean up
        URL.revokeObjectURL(url);
        log("📥 CSV exported successfully");
        
      } catch (error) {
        log(`❌ Export error: ${error.message}`);
        alert("Failed to export data: " + error.message);
      }
    }