const fs = require('fs');
const path = require('path');

// 創建備份清單（手動記錄重要信息）
function createBackupManifest() {
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const manifest = {
    backup_date: new Date().toISOString(),
    project_name: 'Chat App Project2',
    github_repo: 'https://github.com/wuhua-7/project2.git',
    render_url: 'https://project2-g1cl.onrender.com',
    cloudinary_info: {
      note: 'Cloudinary 資源需要從 Dashboard 手動備份',
      default_avatar: 'https://res.cloudinary.com/dvnuhsvtd/image/upload/v1754576538/chat-app/default-avatar.jpg'
    },
    recent_fixes: [
      '修復群組成員顯示 undefined 問題',
      '改進頭像載入失敗錯誤處理',
      '減少重複控制台日誌輸出',
      '增強數據驗證和錯誤處理',
      '統一預設頭像處理邏輯'
    ],
    deployment_status: {
      last_commit: '53993b7',
      last_push: new Date().toISOString(),
      status: 'deployed'
    }
  };
  
  const manifestPath = path.join(backupDir, `backup-manifest-${Date.now()}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  console.log('📋 備份清單已創建:', manifestPath);
  return manifest;
}

// 創建部署檢查清單
function createDeploymentChecklist() {
  const checklist = {
    created_date: new Date().toISOString(),
    deployment_checklist: [
      {
        item: '代碼推送到 GitHub',
        status: '✅ 完成',
        details: 'Commit 53993b7 已推送'
      },
      {
        item: 'Render 自動部署',
        status: '🔄 進行中',
        details: 'Render 會自動檢測 GitHub 更新並部署'
      },
      {
        item: '環境變數配置',
        status: '⚠️ 需檢查',
        details: '確認 Render 中的環境變數設置正確'
      },
      {
        item: 'MongoDB 連接',
        status: '⚠️ 需檢查',
        details: '確認數據庫連接正常'
      },
      {
        item: 'Cloudinary 配置',
        status: '⚠️ 需檢查',
        details: '確認圖片上傳功能正常'
      }
    ],
    next_steps: [
      '等待 Render 部署完成（通常需要 5-10 分鐘）',
      '檢查應用是否正常運行',
      '測試頭像上傳功能',
      '驗證群組成員顯示是否正常',
      '檢查控制台日誌是否清潔'
    ]
  };
  
  const checklistPath = path.join(__dirname, '../backups/deployment-checklist.json');
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
  
  console.log('📝 部署檢查清單已創建:', checklistPath);
  return checklist;
}

// 執行備份
console.log('🔄 開始創建備份和部署記錄...\n');

try {
  const manifest = createBackupManifest();
  const checklist = createDeploymentChecklist();
  
  console.log('\n✅ 備份和部署記錄創建完成！');
  console.log('\n📊 摘要:');
  console.log(`- 項目: ${manifest.project_name}`);
  console.log(`- GitHub: ${manifest.github_repo}`);
  console.log(`- Render: ${manifest.render_url}`);
  console.log(`- 最新修復: ${manifest.recent_fixes.length} 項`);
  
} catch (error) {
  console.error('❌ 備份失敗:', error.message);
}