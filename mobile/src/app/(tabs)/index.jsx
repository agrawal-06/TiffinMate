import React,{useCallback,useState} from 'react';
import {ScrollView,View,Text,Alert} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useSession} from '../../lib/session';
import {api} from '../../lib/api';
import {ClayCard,ClayButton,tactile,palette} from '../../components/clay';
export default function Home(){
 const {token,logout}=useSession();const [data,setData]=useState(null),[kitchen,setKitchen]=useState(null),[operations,setOperations]=useState(null);
 useFocusEffect(useCallback(()=>{let active=true;const headers={Authorization:'Bearer '+token};Promise.all([api('/api/dashboard',{headers}),api('/api/kitchen',{headers}),api('/api/operations/today',{headers})]).then(([d,k,o])=>{if(active){setData(d);setKitchen(k);setOperations(o.summary)}}).catch(e=>{if(active)Alert.alert('Dashboard unavailable',e.message)});return()=>{active=false}},[token]));
 return <ScrollView style={tactile.page} contentContainerStyle={tactile.content}>
 <Text style={tactile.eyebrow}>✦ TIFFINMATE</Text><Text style={tactile.title}>Your happy kitchen 🍲</Text><Text style={tactile.subtitle}>Fresh meals, happy customers, less paperwork.</Text>
 <View style={tactile.hero}><Text style={{color:'#E1F5E8',fontWeight:'900',letterSpacing:2,fontSize:12}}>TODAY'S PREP BOARD</Text><Text style={{fontSize:48,color:'white',fontWeight:'900',marginTop:8}}>{kitchen?.total??'—'}</Text><Text style={{color:'#F2FFF4',fontSize:18,fontWeight:'800'}}>meals to prepare</Text><Text style={{color:'#D4EAD9',marginTop:12}}>{kitchen?.date||'Loading kitchen plan...'}</Text></View>
 <View style={{flexDirection:'row',gap:12}}>{[['🥗','Lunch',kitchen?.portions?.lunch,palette.mint],['🌙','Dinner',kitchen?.portions?.dinner,palette.peach]].map(([icon,label,count,color])=><ClayCard key={label} style={{flex:1,backgroundColor:color,gap:8}}><Text style={{fontSize:28}}>{icon}</Text><Text style={tactile.subtitle}>{label}</Text><Text style={tactile.metric}>{count??'—'}</Text></ClayCard>)}</View>
 <ClayCard style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View><Text style={tactile.subtitle}>👥 YOUR COMMUNITY</Text><Text style={tactile.section}>Active customers</Text></View><Text style={tactile.metric}>{data?.customers??'—'}</Text></ClayCard>
 <Text style={tactile.section}>Live meal operations</Text>
 {['lunch','dinner'].map(type=><ClayCard key={type} style={{gap:9}}><Text style={tactile.section}>{type==='lunch'?'🥗 Lunch':'🌙 Dinner'}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{[['Scheduled','scheduled'],['Paused','paused'],['Delivered','delivered'],['Pending','pending']].map(([label,key])=><View key={key} style={{minWidth:'43%',padding:9,backgroundColor:palette.mint,borderRadius:13}}><Text style={{fontSize:23,fontWeight:'900',color:palette.greenDark}}>{operations?.[type]?.[key]??'—'}</Text><Text style={tactile.subtitle}>{label}</Text></View>)}</View></ClayCard>)}
 <Text style={tactile.subtitle}>Counts are calculated from subscription schedules, approved pauses and delivery records.</Text>
 <ClayButton onPress={logout}>Sign out</ClayButton>
 </ScrollView>
}
