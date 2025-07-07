let chart;

function loadData(minutes = 1440) {
  fetch(`http://localhost:5001/app-usage?since_minutes=${minutes}`)
    .then(res => res.json())
    .then(data => {
      const labels = Object.keys(data);
      const values = Object.values(data);

      if (chart) chart.destroy();

      chart = new Chart(document.getElementById('usageChart'), {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: labels.map(() =>
              `hsl(${Math.random() * 360}, 70%, 60%)`
            )
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'right'
            }
          }
        }
      });

      // Store data for export
      window._latestUsageData = data;
    });
}

function downloadData() {
  const data = window._latestUsageData || {};
  let csv = "App,Minutes\n";
  for (const app in data) {
    csv += `${app},${data[app]}\n`;
  }

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "focusbae_app_usage.csv";
  a.click();
}

window.onload = () => {
  console.log("📊 Dashboard loaded");
  loadData();
}; 

