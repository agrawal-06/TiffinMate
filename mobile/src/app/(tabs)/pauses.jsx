import React,{useCallback,useMemo,useState} from 'react';
import {ScrollView,View,Text,Pressable,Alert,StyleSheet,ActivityIndicator} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useSession} from '../../lib/session';
import {api} from '../../lib/api';
import {tactile,palette,ClayInput,ClayChip} from '../../components/clay';
const dateOnly=x=>x?String(x).slice(0,10):'';
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const monthNow=()=>today().slice(0,7);
const validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const moveMonth=(s,n)=>{const [y,m]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7)};
export default function Pauses(){
 const {token}=useSession(),headers=useMemo(()=>({Authorization:'Bearer '+token}),[token]);
 const [subs,setSubs]=useState([]),[pauses,setPauses]=useState([]),[selected,setSelected]=useState(''),[start,setStart]=useState(today()),[end,setEnd]=useState(today()),[month,setMonth]=useState(monthNow()),[calendar,setCalendar]=useState(null),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{if(!token)return;try{const [s,p]=await Promise.all([api('/api/subscriptions',{headers}),api('/api/operations/pauses',{headers})]);setSubs(s.subscriptions||[]);setPauses(p.pauses||[])}catch(e){Alert.alert('Could not load pauses',e.message)}},[headers,token]);
 useFocusEffect(useCallback(()=>{load()},[load]));
 const loadCalendar=useCallback(async()=>{if(!selected){setCalendar(null);return}try{const c=await api('/api/operations/calendar/'+selected+'?month='+month,{headers});setCalendar(c)}catch(e){Alert.alert('Calendar unavailable',e.message)}},[selected,month,headers]);
 useFocusEffect(useCallback(()=>{loadCalendar()},[loadCalendar]));
 async function create(){if(!selected||!validDay(start)||!validDay(end)||end<start)return Alert.alert('Check details','Choose an active subscription and valid start/end dates.');
 setBusy(true);try{await api('/api/operations/pauses',{method:'POST',headers,body:JSON.stringify({subscriptionId:selected,startDate:start,endDate:end})});await load();await loadCalendar();Alert.alert('Meal pause saved','The kitchen count will exclude approved paused meals.')}catch(e){Alert.alert('Could not pause meals',e.message)}finally{setBusy(false)}}
 function resume(p){Alert.alert('Resume meals','Remove the pause for '+p.customer_name+' ('+dateOnly(p.start_date)+' to '+dateOnly(p.end_date)+')?',[
 {text:'Cancel',style:'cancel'},{text:'Resume',onPress:async()=>{setBusy(true);try{await api('/api/operations/pauses/'+p.id,{method:'DELETE',headers});await load();await loadCalendar()}catch(e){Alert.alert('Could not resume',e.message)}finally{setBusy(false)}}}])}
 const dates=[];if(calendar){const days=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();for(let d=1;d<=days;d++){const day=month+'-'+String(d).padStart(2,'0');const pause=calendar.pauses?.find(p=>p.status==='approved'&&day>=dateOnly(p.start_date)&&day<=dateOnly(p.end_date));const entry=calendar.entries?.find(e=>dateOnly(e.meal_date)===day);dates.push({day,status:pause?'Paused':entry?.status||'Scheduled'})}}
 return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
 <Text style={s.title}>Meal pause & calendar</Text><Text style={s.muted}>Pause individual meal dates without cancelling a subscription.</Text>
 <View style={s.card}><Text style={s.section}>Schedule meal pause</Text><Text style={s.muted}>Select an active subscription</Text><View style={s.row}>{subs.filter(x=>x.status==='active').map(x=><ClayChip key={x.id} selected={selected===x.id} onPress={()=>setSelected(x.id)} label={x.customer_name+' · '+x.meal_type}/>)}</View>
 <Text style={s.muted}>From (YYYY-MM-DD)</Text><ClayInput value={start} onChangeText={setStart} autoCapitalize="none"/>
 <Text style={s.muted}>Until (YYYY-MM-DD)</Text><ClayInput value={end} onChangeText={setEnd} autoCapitalize="none"/>
 <Pressable disabled={busy||!selected} onPress={create} style={[tactile.button,(busy||!selected)&&{opacity:.5}]}><Text style={tactile.buttonText}>Pause selected meals</Text></Pressable><Text style={s.muted}>Already delivered or invoiced meals cannot be paused.</Text></View>
 <Text style={s.section}>Approved pauses</Text>{!pauses.length&&<Text style={s.muted}>No meal pauses yet.</Text>}
 {pauses.map(p=><View style={s.card} key={p.id}><Text style={s.bold}>{p.customer_name} · {p.meal_type}</Text><Text style={s.muted}>{dateOnly(p.start_date)} to {dateOnly(p.end_date)} · {p.status}</Text><Pressable disabled={busy} onPress={()=>resume(p)} style={s.ghost}><Text style={s.link}>Resume meals / remove pause</Text></Pressable></View>)}
 <Text style={s.section}>Subscription calendar</Text><View style={s.row}><Pressable onPress={()=>setMonth(moveMonth(month,-1))} style={s.ghost}><Text style={s.link}>‹ Previous</Text></Pressable><Text style={s.bold}>{month}</Text><Pressable onPress={()=>setMonth(moveMonth(month,1))} style={s.ghost}><Text style={s.link}>Next ›</Text></Pressable></View>
 {!selected?<Text style={s.muted}>Select a subscription above to view its calendar.</Text>:<View style={s.card}>{dates.map(x=><View key={x.day} style={s.calendarRow}><Text style={s.bold}>{x.day.slice(8)}</Text><Text style={[s.muted,x.status==='Paused'&&{color:'#A26722'},x.status==='delivered'&&{color:palette.green}]}>{x.status}</Text></View>)}</View>}
 {busy&&<ActivityIndicator color={palette.green}/>}
 </ScrollView>
}
const s=StyleSheet.create({page:tactile.page,content:{...tactile.content,paddingTop:28,gap:12},title:tactile.title,muted:{color:palette.muted,fontSize:13},section:tactile.section,card:{...tactile.card,gap:12},row:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},bold:{color:palette.ink,fontSize:15,fontWeight:'800'},ghost:{backgroundColor:'#E8F1E7',padding:11,borderRadius:12,alignSelf:'flex-start'},link:{color:palette.greenDark,fontWeight:'800'},calendarRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:7,borderBottomWidth:.5,borderColor:palette.outline}});
