import {calendarFixture,calendarData,calendarRoutes} from './calendar-v16-fixture.mjs';
export {calendarRoutes as settingsRoutes};
export function settingsData(){const data=calendarData();data.state.connections={roots:['/fixture/projects','/fixture/work'],projects:[],agents:[],github:{status:'not_connected',login:'',message:'',at:''},projectScannedAt:'',agentScannedAt:'',errors:[],truncated:false};data.state.model={provider:'合成提供商',model:'保留旧草稿',endpoint:'https://example.test/v1'};return data;}
export async function settingsFixture(){const data=settingsData(),connections=data.state.connections;delete data.state.connections;const app=await calendarFixture('full',{},data);await app.repository.updateConnections(()=>connections);return app;}
